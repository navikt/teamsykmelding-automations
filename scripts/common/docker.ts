import * as R from 'remeda'

export async function getLatestDigestHash(image: string): Promise<string> {
    const process = Bun.spawnSync(['docker', 'manifest', 'inspect', '--verbose', `${image}:latest`])
    const output: any | any[] = JSON.parse(process.stdout.toString())

    let digest: string | null
    if (Array.isArray(output)) {
        digest = output.find((it) => it.Descriptor.platform.architecture === 'amd64').Descriptor.digest ?? null
    } else {
        digest = output.Descriptor.digest ?? null
    }

    if (digest == null) {
        throw new Error(`No manifest found: ${process.stderr?.toString() ?? 'No error'}`)
    }

    return digest
}
