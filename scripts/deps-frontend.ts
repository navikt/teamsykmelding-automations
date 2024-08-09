import * as R from 'remeda'
import { octokit } from './common/octokit.ts'
import { postBlocks } from './common/slack.ts'

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
    const nodes: {
        name: string
        url: string
        isArchived: true
        primaryLanguage?: { name: string }
        pullRequests: { nodes: { author: { login: string } }[] }
    }[] = queryResult.organization.team.repositories.nodes

    const relevantRepos = R.pipe(
        nodes,
        R.filter((it) => !it.isArchived),
        R.filter((it) => !ignoredRepos.includes(it.name)),
        R.groupBy((it) => it.primaryLanguage?.name ?? 'unknown'),
        R.pick(['TypeScript', 'JavaScript']),
        R.values(),
        R.flat(),
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

    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:pepejam: Denne uka er det ${repos.length} frontend repos som har totalt ${R.sumBy(repos, ([repo, url, prs]) => prs)} dependabot PR-er :pepejam:`,
            },
        },
    ]

    await postBlocks(blocks)
}

await postBumper()
