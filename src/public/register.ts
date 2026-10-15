import { getContext } from '@/st/context';
import { PLUGIN_VERSION } from '@/version';

export interface MyExtensionPublicApi {
  version: string;
  getData: () => Record<string, unknown>;
  subscribe: (listener: (data: unknown) => void) => () => void;
}

const listeners = new Set<(data: unknown) => void>();

export function emitChange(data: unknown): void {
  for (const listener of listeners) {
    try {
      listener(data);
    } catch (e) {
      console.warn('[MyExtension] 订阅回调异常', e);
    }
  }
  window.dispatchEvent(new CustomEvent('my-extension:changed', { detail: data }));
}

async function registerSlashCommand(): Promise<boolean> {
  try {
    const parserPath = '/scripts/slash-commands/SlashCommandParser.js';
    const commandPath = '/scripts/slash-commands/SlashCommand.js';
    const argumentPath = '/scripts/slash-commands/SlashCommandArgument.js';
    const [parserMod, cmdMod, argMod] = await Promise.all([
      import(/* @vite-ignore */ parserPath),
      import(/* @vite-ignore */ commandPath),
      import(/* @vite-ignore */ argumentPath),
    ]);
    const { SlashCommandParser } = parserMod;
    const { SlashCommand } = cmdMod;
    const { ARGUMENT_TYPE, SlashCommandArgument } = argMod;

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
      name: 'my-ext',
      callback: (_args: unknown, unnamed: unknown) => {
        return `Hello from extension! Arg: ${String(unnamed ?? '')}`;
      },
      unnamedArgumentList: [
        SlashCommandArgument.fromProps({
          description: '测试参数',
          typeList: [ARGUMENT_TYPE.STRING],
        }),
      ],
      helpString: '<div>扩展测试命令: <code>/my-ext [arg]</code></div>',
      returns: ARGUMENT_TYPE.STRING,
    }));
    return true;
  } catch {
    return false;
  }
}

async function registerMacros(): Promise<boolean> {
  try {
    const legacyPath = '/scripts/macros.js';
    const { MacrosParser } = await import(/* @vite-ignore */ legacyPath);
    MacrosParser.registerMacro('myExtMacro', () => 'ExtensionMacroValue', '扩展测试宏');
    return true;
  } catch {
    return false;
  }
}

export async function registerPublicInterface(): Promise<void> {
  const api: MyExtensionPublicApi = Object.freeze({
    version: PLUGIN_VERSION,
    getData: () => ({ status: 'ok', timestamp: Date.now() }),
    subscribe: (listener: (data: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });

  (globalThis as any).MyExtensionApi = api;

  await Promise.all([
    registerSlashCommand(),
    registerMacros(),
  ]);

  window.dispatchEvent(new CustomEvent('my-extension:ready', { detail: { version: PLUGIN_VERSION } }));
  console.log('[MyExtension] 公共接口与生态扩展已就绪');
}
