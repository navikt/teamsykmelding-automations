import * as R from 'remeda'
import { getWeek } from 'date-fns'
import { octokit } from './common/octokit.ts'
import { postBlocks } from './common/slack.ts'

const bumpers = ['jaflaten', 'helehar', 'MikAoJk', 'andreasDev']

function getBumper(): string {
    const weekNumber = getWeek(new Date()) + 1

    return bumpers[weekNumber % bumpers.length]
}


async function getRelevantRepos(): Promise<[string, string, number][]> {
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
                            pullRequests(first: 10, orderBy: { field: UPDATED_AT, direction: DESC }, states: OPEN) {
                                nodes {
                                    author {
                                        avatarUrl
                                        login
                                    }
                                }
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
            pullRequests: { nodes: { author: { login: string } }[] }
        }[],
        R.filter((it) => !it.isArchived),
        R.groupBy((it) => it.primaryLanguage?.name ?? 'unknown'),
        R.pick(['Kotlin', 'Rust']),
        R.values,
        R.flatten(),
        R.map((it): [string, string, number] => [
            it.name,
            it.url,
            it.pullRequests.nodes.filter((pr) => pr.author.login.includes('dependabot')).length,
        ]),
        R.sortBy([(it) => it[2], 'desc']),
    )

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
                text: `:pepejam: Ukens backend-dependency-ansvarlig er <https://github.com/${bumper}|${bumper}> :pepejam:`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Aktive backend-repoer:`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: repos
                    .map(
                        ([name, url, prs]) =>
                            `- <${url}|${name}> ${prs > 0 ? `(${prs} åpne dependabot PR-er)` : ':github-check-mark:'} `,
                    )
                    .join('\n'),
            },
        },
    ]

    await postBlocks(blocks)
}

await postBumper()
