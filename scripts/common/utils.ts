export function exitWithMessage(message: string, code: number): never {
    console.log(message)
    process.exit(code)
}

export function raise(message: string): never {
    throw new Error(message)
}
