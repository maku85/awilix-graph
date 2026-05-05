import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { OutputFormat } from './types';

function launch(target: string): void {
	let cmd: string;
	let args: string[];
	if (process.platform === 'darwin') {
		cmd = 'open';
		args = [target];
	} else if (process.platform === 'win32') {
		cmd = 'cmd';
		args = ['/c', 'start', '', target];
	} else {
		cmd = 'xdg-open';
		args = [target];
	}
	spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Open the rendered graph output in the most appropriate viewer:
 *  - mermaid → https://mermaid.live (base64-encoded state)
 *  - dot     → https://dreampuf.github.io/GraphvizOnline (URL-encoded source)
 *  - json    → temp file opened by the OS default application
 *
 * Returns the URL or file path that was opened (for stderr feedback).
 */
export function openGraph(output: string, format: OutputFormat): string {
	if (format === 'mermaid') {
		const state = JSON.stringify({
			code: output,
			mermaid: '{"theme":"default"}',
		});
		const encoded = Buffer.from(state).toString('base64');
		const url = `https://mermaid.live/edit#base64:${encoded}`;
		launch(url);
		return url;
	}

	if (format === 'dot') {
		const encoded = encodeURIComponent(output);
		const url = `https://dreampuf.github.io/GraphvizOnline/#${encoded}`;
		launch(url);
		return url;
	}

	// html / json: write to a temp file and open with the OS default app
	const ext = format === 'html' ? 'html' : 'json';
	const tmpFile = path.join(os.tmpdir(), `awilix-graph-${Date.now()}.${ext}`);
	fs.writeFileSync(tmpFile, output, 'utf8');
	launch(tmpFile);
	return tmpFile;
}
