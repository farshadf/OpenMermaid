export async function copyText(text: string): Promise<void> {
  const clipboard = Reflect.get(navigator, 'clipboard') as Clipboard | undefined;
  if (clipboard !== undefined) {
    await clipboard.writeText(text);
    return;
  }
  throw new Error('Clipboard access is unavailable. Select and copy the text manually.');
}
