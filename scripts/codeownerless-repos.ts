import * as R from 'remeda'
import { octokit } from './common/octokit.ts'
import { postBlocks } from './common/slack.ts'

type RepoNodes = {
    name: string
    isArchived: boolean
    url: string
    codeowners: null | {
        errors: {
            message: string
        }[]
    }
}

const getTeamReposQuery = /* GraphQL */ `
    query ReposWithCodeowners($team: String!) {
        organization(login: "navikt") {
            team(slug: $team) {
                repositories(orderBy: { field: PUSHED_AT, direction: DESC }) {
                    nodes {
                        name
                        url
                        isArchived
                        codeowners {
                            errors {
                                message
                            }
                        }
                    }
                }
            }
        }
    }
`

async function getReposWithCodeownerIssues(team: string): Promise<{ name: string; url: string; error: string }[]> {
    console.info(`Repos without codeowners for team ${team}`)

    const queryResult = (await octokit.graphql(getTeamReposQuery, {
        team,
    })) as any

    const repos = R.pipe(
        queryResult.organization.team.repositories.nodes as RepoNodes[],
        R.filter((it) => !it.isArchived),
        R.filter((it) => it.codeowners == null || it.codeowners.errors.length > 0),
        (it) => {
            console.log(it)
            return it
        },
        R.map((repo) => ({
            name: repo.name,
            error: repo.codeowners?.errors.map((it) => it.message).join('\n') ?? 'Missing CODEOWNERS file',
            url: repo.url,
        })),
    )

    console.info(`Got ${repos.length} codeownerless repos for team ${team}`)

    return repos
}

const codeownerlessRepos = await getReposWithCodeownerIssues('teamsykmelding')

console.log(codeownerlessRepos)

if (codeownerlessRepos.length === 0) {
    console.info('Found no repos with CODEOWNER issues')
    process.exit(0)
}

await postBlocks([
    {
        type: 'header',
        text: {
            type: 'plain_text',
            text: `:reeee: Det er ${codeownerlessRepos.length} repos som har trøbbel med CODEOWNERS`,
            emoji: true,
        },
    },
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: codeownerlessRepos
                .map(
                    (it) =>
                        `- <${it.url}|${it.name}>: ${
                            it.error.includes('\n') ? `\`\`\`${it.error}\`\`\`` : `${it.error}`
                        }`,
                )
                .join('\n'),
        },
    },
])
