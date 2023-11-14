import * as R from 'remeda'
import { octokit } from './common/octokit.ts'
import { postBlocks } from './common/slack.ts'
import { getFrontendBumperForOddWeeksOnly } from './common/bumper.ts'

const ignoredRepos = ['diagnosekoder']

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
        R.filter((it) => !ignoredRepos.includes(it.name)),
        R.groupBy((it) => it.primaryLanguage?.name ?? 'unknown'),
        R.pick(['TypeScript', 'JavaScript']),
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
    const bumper = getFrontendBumperForOddWeeksOnly(new Date())

    if (bumper == null) {
        console.info('Skipping this week, crontab doesnt support biweekly')
    }

    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:pepejam: Ukens frontend-dependency-ansvarlig er <https://github.com/${bumper}|${bumper}> :pepejam:`,
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
