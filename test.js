import process from 'node:process';
import childProcess from 'node:child_process';
import test from 'ava';
import noopProcess from 'noop-process';
import processExists from 'process-exists';
import delay from 'delay';
import getPort from 'get-port';
import execa from 'execa';
import fkill from './index.js';

const testRequiringNoopProcessToSetTitleProperly = () => (process.versions.node.split('.')[0] === '12') ? test.skip : test;

async function noopProcessKilled(t, pid) {
	// Ensure the noop process has time to exit.
	await delay(100);
	t.false(await processExists(pid));
}

test('pid', async t => {
	const pid = await noopProcess();
	await fkill(pid, {force: true});
	await noopProcessKilled(t, pid);
});

if (process.platform === 'win32') {
	test.serial('title', async t => {
		const title = 'notepad.exe';
		const {pid} = childProcess.spawn(title);

		await fkill(title, {force: true});

		t.false(await processExists(pid));
	});

	test.serial('win default ignore case', async t => {
		const title = 'notepad.exe';
		const {pid} = childProcess.spawn(title);

		await fkill('NOTEPAD.EXE', {force: true});

		t.false(await processExists(pid));
	});
} else {
	testRequiringNoopProcessToSetTitleProperly()('title', async t => {
		const title = 'fkill-test';
		const pid = await noopProcess({title});

		await fkill(title);

		await noopProcessKilled(t, pid);
	});

	testRequiringNoopProcessToSetTitleProperly()('ignore case', async t => {
		const pid = await noopProcess({title: 'Capitalized'});
		await fkill('capitalized', {ignoreCase: true});

		await noopProcessKilled(t, pid);
	});

	testRequiringNoopProcessToSetTitleProperly()('exact match', async t => {
		const title = 'foo-bar';
		const pid = await noopProcess({title});

		await t.throwsAsync(fkill('foo'), {message: /Process doesn't exist/});

		t.true(await processExists(pid));

		// Cleanup
		await fkill(title);
	});
}

test('fail', async t => {
	const error = await t.throwsAsync(fkill(['123456', '654321']));
	t.regex(error.message, /123456/);
	t.regex(error.message, /654321/);
});

test.serial('don\'t kill self', async t => {
	const originalFkillPid = process.pid;
	const pid = await noopProcess();
	Object.defineProperty(process, 'pid', {value: pid});

	await fkill(process.pid);

	await delay(noopProcessKilled(t, pid));
	t.true(await processExists(pid));
	Object.defineProperty(process, 'pid', {value: originalFkillPid});
});

test.serial('don\'t kill `fkill` when killing `node` or `node.exe`', async t => {
	const result = await execa('node', ['./fixture2.js'], {detached: true});
	t.is(result.exitCode, 0);
});

test('ignore ignore-case for pid', async t => {
	const pid = await noopProcess();
	await fkill(pid, {force: true, ignoreCase: true});
	await noopProcessKilled(t, pid);
});

test('kill from port', async t => {
	const port = await getPort();
	const {pid} = childProcess.spawn(process.execPath, ['fixture.js', port]);
	await fkill(pid, {force: true});
	await noopProcessKilled(t, pid);
});

test('error when process is not found', async t => {
	await t.throwsAsync(
		fkill(['notFoundProcess']),
		{message: /Killing process notFoundProcess failed: Process doesn't exist/},
	);
});

test('error when process is not found (force: true)', async t => {
	await t.throwsAsync(
		fkill(['notFoundProcess'], {force: true}),
		{message: /Killing process notFoundProcess failed: Process doesn't exist/},
	);
});

test('suppress errors when silent', async t => {
	await t.notThrowsAsync(fkill(['123456', '654321'], {silent: true}));
	await t.notThrowsAsync(fkill(['notFoundProcess'], {silent: true}));
});

test('force works properly for process ignoring SIGTERM', async t => {
	const {pid} = childProcess.spawn(process.execPath, ['fixture-ignore-sigterm.js']);
	await fkill(pid, {});
	await delay(100);
	t.true(await processExists(pid));
	await fkill(pid, {force: true});
	await noopProcessKilled(t, pid);
});

test('forceAfterTimeout works properly for process ignoring SIGTERM', async t => {
	const {pid} = childProcess.spawn(process.execPath, ['fixture-ignore-sigterm.js']);
	const promise = fkill(pid, {forceAfterTimeout: 100});
	t.true(await processExists(pid));
	await delay(50);
	t.true(await processExists(pid));
	await promise;
	await noopProcessKilled(t, pid);
});
