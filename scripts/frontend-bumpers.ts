import * as R from 'remeda'
import { getWeek } from 'date-fns'
import { octokit } from './common/octokit.ts'
import { postBlocks } from './common/slack.ts'

const bumpers = ['nuranes', 'karl-run']

function getBumper(): string {
    const weekNumber = getWeek(new Date()) + 1

    return bumpers[weekNumber % bumpers.length]
}

const ignoredRepos = ['diagnosekoder']

async function getRelevantRepos(): Promise<[string, string][]> {
    const reposQuery = /* GraphQL */ `
        query {
            organization(login: "navikt") {
                team(slug: "teamsykmelding") {
                    repositories(orderBy: { field: PUSHED_AT, direction: DESC }) {
                        nodes {
                            name
                            isArchived
                            url
                            primaryLanguage {
                                name
                            }
                        }
                    }
                }
            }
        }
    `
    const queryResult = (await octokit.graphql(reposQuery)) as any
    const relevantRepos = R.pipe(
        queryResult.organization.team.repositories.nodes as {
            name: string
            url: string
            isArchived: true
            primaryLanguage?: { name: string }
        }[],
        R.filter((it) => !it.isArchived),
        R.filter((it) => !ignoredRepos.includes(it.name)),
        R.groupBy((it) => it.primaryLanguage?.name ?? 'unknown'),
        R.pick(['TypeScript', 'JavaScript']),
        R.values,
        R.flatten(),
        R.map((it): [string, string] => [it.name, it.url]),
    )

    console.log(relevantRepos)

    return relevantRepos
}

async function postBumper() {
    const repos = await getRelevantRepos()
    const bumper = getBumper()

    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:pepejam: Ukens frontend-dependency-ansvarlig er <https://github.com/${getBumper()}|${getBumper()}> :pepejam:`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Aktive frontend-repoer:`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: repos.map(([name, url]) => `- <${url}|${name}>`).join('\n'),
            },
        },
    ]

    await postBlocks(blocks)
}

await postBumper()
