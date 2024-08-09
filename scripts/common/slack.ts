const WEBHOOK_URL = Bun.env.SLACK_WEBHOOK_URL

if (!WEBHOOK_URL) {
    console.error('SLACK_WEBHOOK_URL is not set')
    process.exit(1)
}

export async function postBlocks(blocks: any[]) {
    const result = await fetch(WEBHOOK_URL as string, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            blocks: limitTo50Blocks(blocks),
        }),
    })

    if (result.ok) {
        console.info('Posted to Slack OK')
        process.exit(0)
    } else {
        console.error(`Failed to post to Slack, ${result.status} ${result.statusText}`)
        console.error(await result.text())
        process.exit(1)
    }
}

function limitTo50Blocks(blocks: any[]) {
    if (blocks.length <= 50) {
        return blocks
    }

    console.warn(`Blocks length ${blocks.length} exceeds 50, truncating`)

    return [
        ...blocks.slice(0, 49),
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `... and ${blocks.length - 49} more`,
            },
        },
    ]
}
