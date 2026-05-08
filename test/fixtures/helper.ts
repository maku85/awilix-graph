import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const TMP = path.join(os.tmpdir(), 'awilix-graph-fixtures');

/**
 * Write a single JS fixture file to a temp directory and return its absolute path.
 * The `slug` is used to derive a unique, stable directory name per test.
 */
export async function buildFixture(slug: string, content: string): Promise<string> {
	const dir = path.join(TMP, slug);
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, 'container.js');
	fs.writeFileSync(file, content.trim(), 'utf8');
	return file;
}

/**
 * Write multiple JS fixture files to a temp directory.
 * Returns the absolute path to the `entryFile` within that directory.
 */
export async function buildMultiFileFixture(
	slug: string,
	files: Record<string, string>,
	entryFile: string
): Promise<string> {
	const dir = path.join(TMP, slug);
	fs.mkdirSync(dir, { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(dir, name), content.trim(), 'utf8');
	}
	return path.join(dir, entryFile);
}
