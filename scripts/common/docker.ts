import { $ } from 'bun'

export async function getLatestDigestHash(image: string): Promise<string> {
    const output = await $`docker manifest inspect --verbose ${image}:latest`.quiet().throws(true).json()

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
