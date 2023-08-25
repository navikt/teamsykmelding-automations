import * as R from 'remeda'

import { raise } from './common/utils.ts'
import { postBlocks } from './common/slack.ts'
import { cloneOrPull, createRepoGitClient, GIT_DIR } from './common/git.ts'
import { octokit } from './common/octokit.ts'
import path from 'node:path'
import { getLatestDigestHash } from './common/docker.ts'

const hasNewDigestArg = Bun.argv.includes('--has-new-digest')
const makeChangesArg = Bun.argv.includes('--make-changes')
const image = Bun.argv.find((it) => it.startsWith('--image='))?.split('=')[1] ?? raise('Missing --image=<image> flag')

if (!hasNewDigestArg && !makeChangesArg) {
    console.error('Missing --has-new-digest or --make-changes flag 😡')
    process.exit(1)
}

if (hasNewDigestArg && makeChangesArg) {
    console.error("Can't pass both --has-new-digest and --make-changes flag at the same time you dumbo 😡")
    process.exit(1)
}

console.info(`Using image ${image}`)
const relevantRepos: string[] = await getRelevantRepositories(image)

if (hasNewDigestArg) {
    /**
     * We're simply looking for changes in Dockerfile using the newest digest
     */
    await cloneAllRepos()
    const latestDigest = await getLatestDigestHash(image)
    const hasDigestChanged = await updateReposAndDiff(latestDigest)

    appendToFile(Bun.env.GITHUB_OUTPUT ?? raise('GITHUB_OUTPUT env missing'), [
        `digest-changed=${hasDigestChanged.hasChanged}`,
        `digest=${hasDigestChanged.digest}`,
    ])
    if (hasDigestChanged.hasChanged) {
        appendToFile(Bun.env.GITHUB_STEP_SUMMARY ?? raise('GITHUB_STEP_SUMMARY env missing'), [
            `The new digest is: \`${hasDigestChanged.digest}\`\n`,
            `There are ${hasDigestChanged.changedRepos} repos that needs the new digest`,
            `\n\n`,
            `Visit [${image}](${image}) and verify that the digest is correct on the "latest" tag.`,
        ])

        await postSlackUpdate(hasDigestChanged)
    } else {
        appendToFile(Bun.env.GITHUB_STEP_SUMMARY ?? raise('GITHUB_STEP_SUMMARY env missing'), [
            `The digest is ${hasDigestChanged.digest}`,
            `It hasn't changed since last time`,
        ])
    }

    process.exit(0)
} else if (makeChangesArg) {
    /**
     * Assumes the github job passes the digest version from the previous job, make the changes, commit and push
     */
    const digestArg = Bun.argv.find((it) => it.startsWith('--digest='))

    if (digestArg == null) {
        console.error('Missing --digest=<digest> flag')
        process.exit(1)
    }

    const digest = digestArg.split('=')[1]

    await cloneAllRepos()
    await updateAllDockerfiles(digest)

    const changedRepos = await Promise.all(
        relevantRepos.map(async (repo) => {
            const git = createRepoGitClient(repo)
            await git.add('Dockerfile')
            return git.commit(`automated: update distroless with newest digest`, ['--no-verify'])
        }),
    )
    console.info(`Committed changes in ${changedRepos.length} repos`)

    const pushed = await Promise.all(
        relevantRepos.map(async (repo) => {
            const git = createRepoGitClient(repo)
            const pushResult = await git.push()
            console.info(pushResult)
            return pushResult
        }),
    )
    console.info(`Pushed changes in ${pushed.length} repos`)

    process.exit(0)
} else {
    console.error("Whelp, this code has some bugs. This shouldn't be possible")
    process.exit(1)
}

export async function updateDockerfile(repo: string, hash: string) {
    const dockerfileFile = Bun.file(`${GIT_DIR}/${repo}/Dockerfile`)
    const content = await dockerfileFile.text()
    const updatedContent = content.replace(/FROM(.*)\n/, `FROM ${image}@${hash}\n`)

    await Bun.write(dockerfileFile, updatedContent)

    console.info(`Updated Dockerfile for ${repo} with hash ${hash}`)
}

async function updateAllDockerfiles(latestDigest: string) {
    await Promise.all(relevantRepos.map((repo) => updateDockerfile(repo, latestDigest)))
}

async function updateReposAndDiff(
    latestDigest: string,
): Promise<{ hasChanged: boolean; digest: string; changedRepos: number }> {
    await updateAllDockerfiles(latestDigest)
    const anyGitFolderHasUnstagedChanges = (
        await Promise.all(
            relevantRepos.map((repo) => {
                const git = createRepoGitClient(repo)
                return git.diffSummary()
            }),
        )
    ).map((it) => it.files.length)

    const changedRepos = anyGitFolderHasUnstagedChanges.filter((it) => it > 0)
    if (changedRepos.length > 0) {
        console.info(`Found changes in ${changedRepos.length} repos`)
        return { hasChanged: true, digest: latestDigest, changedRepos: changedRepos.length }
    }

    console.info('No digests changed')
    return { hasChanged: false, digest: latestDigest, changedRepos: 0 }
}

async function cloneAllRepos() {
    await Promise.all(relevantRepos.map(cloneOrPull))
}

function appendToFile(filename: string, lines: string[]) {
    const file = Bun.file(filename)
    const writer = file.writer()
    lines.forEach((line) => writer.write(`${line}\n`))
    writer.flush()
}

async function getRelevantRepositories(image: string): Promise<string[]> {
    const repoNodes: { name: string; isArchived: boolean }[] = (
        (await octokit.graphql(
            `query OurRepos($team: String!) {
                organization(login: "navikt") {
                    team(slug: $team) {
                        repositories { nodes { name isArchived pushedAt url } }
                    }
                }
            }`,
            { team: 'teamsykmelding' },
        )) as any
    ).organization.team.repositories.nodes

    const repositories: string[] = repoNodes.filter((it) => !it.isArchived).map((it: any) => it.name)

    console.info(`Found ${repositories.length} non-archived repositories`)
    await Promise.all(repositories.map(cloneOrPull))

    const reposWithDockerfiles = await Promise.all(
        repositories.map(async (repo): Promise<[string, string | null]> => {
            const dockerfileFile = Bun.file(path.join(GIT_DIR, repo, 'Dockerfile'))
            if (!(await dockerfileFile.exists())) {
                console.info(`No Dockerfile found for ${repo}, skipping`)
                return [repo, null]
            }

            const dockerfileImage = (await dockerfileFile.text()).match(/FROM (.*)\n/)

            return [repo, dockerfileImage?.at(0) ?? null]
        }),
    )

    return R.pipe(
        reposWithDockerfiles,
        R.filter(([, dockerfileImage]) => dockerfileImage != null),
        R.filter(([repo, dockerfileImage]) => {
            const relevantImage = dockerfileImage?.includes(image)
            if (!relevantImage) {
                console.info(`${image} is not relevant for ${dockerfileImage?.trim()} (${repo})`)
            }
            return relevantImage ?? false
        }),
        R.map(([repo]) => repo),
    )
}

function postSlackUpdate(hasDigestChanged: {
    hasChanged: boolean
    digest: string
    changedRepos: number
}): Promise<void> {
    return postBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `Ny distroless digest for ${image}!`,
                emoji: true,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `\`${hasDigestChanged.digest}\`\n\nDenne versjonen trenger å bli oppdatert i ${hasDigestChanged.changedRepos} repositories`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Verifiser at denne versjonen er riktig på ${image} under "latest" tag`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Dersom alt ser bra ut kan du godkjenne oppgraderingen på ${Bun.env.GITHUB_SERVER_URL}/${Bun.env.GITHUB_REPOSITORY}/actions/runs/${Bun.env.GITHUB_RUN_ID}`,
            },
        },
    ])
}
