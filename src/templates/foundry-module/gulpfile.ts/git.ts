import * as fs from 'fs-extra';
import * as chalk from 'chalk';
import * as stringify from 'json-stringify-pretty-compact';
import { foundryManifest } from './foundry-manifest';
import { configJson } from './config';
import { cli } from './cli';
import { args } from './args';

export class Git {
  public async updateManifestForGithub({source, externalManifest}: {source: boolean, externalManifest: boolean}): Promise<void> {
    const packageJson = fs.readJSONSync('package.json');
    const config = configJson.getConfig();
    const manifest = foundryManifest.getManifest();

    if (!config) {
      throw new Error(chalk.red('foundryconfig.json not found in the ./ (root) folder'));
    }
    if (!manifest) {
      throw new Error(chalk.red('Manifest JSON not found in the ./src folder'));
    }
    if (!config.githubRepository) {
      throw new Error(chalk.red('Missing "githubRepository" property in ./config.json. Expected format: <githubUsername>/<githubRepo>'));
    }

    const currentVersion = manifest.file.version;
    let targetVersion = args.getVersion(currentVersion, true);
    if (targetVersion == null) {
      targetVersion = currentVersion;
    }

    if (targetVersion.startsWith('v')) {
      targetVersion = targetVersion.substring(1);
    }

    console.log(`Updating version number to '${targetVersion}'`);

    packageJson.version = targetVersion;

    manifest.file.version = targetVersion;
    manifest.file.url = `https://github.com/${config.githubRepository}`;
    // When foundry checks if there is an update, it will fetch the manifest present in the zip, for us it points to the latest one.
    // The external one should point to itself so you can download a specific version
    // The zipped one should point to the latest manifest so when the "check for update" is executed it will fetch the latest
    if (externalManifest) {
      // Seperate file uploaded for github
      manifest.file.manifest = `https://github.com/${config.githubRepository}/releases/download/v${targetVersion}/module.json`;
    } else {
      // The manifest which is within the module zip
      manifest.file.manifest = `https://github.com/${config.githubRepository}/releases/download/latest/module.json`;
    }
    manifest.file.download = `https://github.com/${config.githubRepository}/releases/download/v${targetVersion}/module.zip`;

    fs.writeFileSync(
      'package.json',
      stringify(packageJson, {indent: '  '}),
      'utf8'
    );
    await foundryManifest.saveManifest({overrideManifest: manifest.file, source: source});
    
  }

  public async validateCleanRepo(): Promise<void> {
    const cmd = await cli.execPromise('git status --porcelain');
    cli.throwError(cmd);
    if (typeof cmd.stdout === 'string' && cmd.stdout.length > 0) {
      throw new Error("You must first commit your pending changes");
    }
  }

  public async commitNewVersion(): Promise<void> {
    cli.throwError(await cli.execPromise('git add .'), {ignoreOut: true});
    let newVersion = 'v' + foundryManifest.getManifest().file.version;
    cli.throwError(await cli.execPromise(`git commit -m "Updated to ${newVersion}`));
  }

  public async deleteVersionTag(version?: string): Promise<void> {
    if (version == null) {
      version = 'v' + foundryManifest.getManifest().file.version;
    }
    // Ignore errors
    await cli.execPromise(`git tag -d ${version}`);
    await cli.execPromise(`git push --delete origin ${version}`);
  }

  public async tagCurrentVersion(): Promise<void> {
    let version = 'v' + foundryManifest.getManifest().file.version;
    cli.throwError(await cli.execPromise(`git tag -a ${version} -m "Updated to ${version}"`));
    cli.throwError(await cli.execPromise(`git push origin ${version}`), {ignoreOut: true});
  }

  public async push(): Promise<void> {
    cli.throwError(await cli.execPromise(`git push`));
  }

  public async gitMoveTag() {
    await this.deleteVersionTag();
    await this.tagCurrentVersion();
  }
}

export const git = new Git();
for (let prop in git) {
  if (typeof git[prop] === 'function') {
    git[prop] = git[prop].bind(git);
  }
}