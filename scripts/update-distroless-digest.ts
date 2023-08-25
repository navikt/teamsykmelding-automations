import * as R from 'remeda'

import { raise } from './common/utils.ts'
import { postBlocks } from './common/slack.ts'
import { createRepoGitClient, cloneOrPull, GIT_DIR } from './common/git.ts'

const config = {
    DISTROLESS_IMAGE: 'gcr.io/distroless/nodejs18-debian11',
    RELEVANT_REPOS: ['syfosmmanuell', 'syk-dig', 'smregistrering', 'sykmeldinger', 'dinesykmeldte'] as const,
}

const hasNewDigestArg = Bun.argv.includes('--has-new-digest')
const makeChangesArg = Bun.argv.includes('--make-changes')

if (!hasNewDigestArg && !makeChangesArg) {
    console.error('Missing --has-new-digest or --make-changes flag 😡')
    process.exit(1)
}

if (hasNewDigestArg && makeChangesArg) {
    console.error("Can't pass both --has-new-digest and --make-changes flag at the same time you dumbo 😡")
    process.exit(1)
}

if (hasNewDigestArg) {
    /**
     * We're simply looking for changes in Dockerfile using the newest digest
     */
    await cloneAllRepos()
    const hasDigestChanged = await updateReposAndDiff()

    appendToFile(Bun.env.GITHUB_OUTPUT ?? raise('GITHUB_OUTPUT env missing'), [
        `digest-changed=${hasDigestChanged.hasChanged}`,
        `digest=${hasDigestChanged.digest}`,
    ])
    if (hasDigestChanged.hasChanged) {
        appendToFile(Bun.env.GITHUB_STEP_SUMMARY ?? raise('GITHUB_STEP_SUMMARY env missing'), [
            `The new digest is: \`${hasDigestChanged.digest}\`\n`,
            `There are ${hasDigestChanged.changedRepos} repos that needs the new digest`,
            `\n\n`,
            `Visit [${config.DISTROLESS_IMAGE}](${config.DISTROLESS_IMAGE}) and verify that the digest is correct on the "latest" tag.`,
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
        config.RELEVANT_REPOS.map(async (repo) => {
            const git = createRepoGitClient(repo)
            await git.add('Dockerfile')
            return git.commit(`automated: update distroless with newest digest`, ['--no-verify'])
        }),
    )
    console.info(`Committed changes in ${changedRepos.length} repos`)

    const pushed = await Promise.all(
        config.RELEVANT_REPOS.map(async (repo) => {
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
    const updatedContent = content.replace(/FROM(.*)\n/, `FROM ${config.DISTROLESS_IMAGE}@${hash}\n`)

    await Bun.write(dockerfileFile, updatedContent)

    console.info(`Updated Dockerfile for ${repo} with hash ${hash}`)
}

async function updateAllDockerfiles(latestDigest: string) {
    await Promise.all(config.RELEVANT_REPOS.map((repo) => updateDockerfile(repo, latestDigest)))
}

async function updateReposAndDiff(): Promise<{ hasChanged: boolean; digest: string; changedRepos: number }> {
    const latestDigest = await getLatestDigestHash()

    await updateAllDockerfiles(latestDigest)
    const anyGitFolderHasUnstagedChanges = (
        await Promise.all(
            config.RELEVANT_REPOS.map((repo) => {
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

export async function getLatestDigestHash(): Promise<string> {
    const process = Bun.spawnSync(['docker', 'manifest', 'inspect', `${config.DISTROLESS_IMAGE}:latest`])
    const manifest = R.pipe(
        process,
        (it): any[] => JSON.parse(it.stdout.toString()).manifests,
        R.find((it) => it.platform.architecture === 'amd64'),
    )

    if (manifest == null) {
        throw new Error(`No manifest found: ${process.stderr?.toString() ?? 'No error'}`)
    }

    return manifest.digest
}

async function cloneAllRepos() {
    await Promise.all(config.RELEVANT_REPOS.map(cloneOrPull))
}

function appendToFile(filename: string, lines: string[]) {
    const file = Bun.file(filename)
    const writer = file.writer()
    lines.forEach((line) => writer.write(`${line}\n`))
    writer.flush()
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
                text: `Ny distroless digest for ${config.DISTROLESS_IMAGE}!`,
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
                text: `Verifiser at denne versjonen er riktig på ${config.DISTROLESS_IMAGE} under "latest" tag`,
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
