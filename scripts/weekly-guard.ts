import * as R from 'remeda'
import { getWeek } from 'date-fns'
import { postBlocks } from './common/slack.ts'

const guards = ['nuranes', 'karl-run', 'jaflaten', 'helehar', 'Bendixx']

function getGuard(): string {
    const weekNumber = getWeek(new Date()) + 1

    return guards[weekNumber % guards.length]
}


async function postGuard() {
    const guard = getGuard()

    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:pepejam: Ukas vakt er <https://github.com/${guard}|${guard}> :pepejam:`,
            },
        },
    ]

    await postBlocks(blocks)
}

await postGuard()
