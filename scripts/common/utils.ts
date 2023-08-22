export function exitWithMessage(message: string, code: number): never {
    console.log(message)
    process.exit(code)
}
