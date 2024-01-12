#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as enquirer from 'enquirer';
import * as shell from 'shelljs';
import * as ejs from 'ejs';

interface CliOptions {
  template: string;
  projectName: string;
  projectLabel: string;
}

// Cache the absolute paths
const scriptDir = path.resolve(__dirname);
const workingDir = path.resolve(process.cwd());

async function deepCopy(templatePath: string, targetPath: string, options: CliOptions) {
  const SKIP_FILES = ['node_modules', '.template.json'];
  let pendingCopies: Array<{fromPath: string; toPath: string}> = [{fromPath: templatePath, toPath: targetPath}];

  while (pendingCopies.length > 0) {
    const processingCopies = pendingCopies;
    pendingCopies = [];

    for (const copyAction of processingCopies) {
      if (SKIP_FILES.includes(path.parse(copyAction.fromPath).base)) {
        continue;
      }

      const stats = fs.statSync(copyAction.fromPath);
      if (stats.isFile()) {
        let contents: string | Buffer;
        try {
          contents = fs.readFileSync(copyAction.fromPath, 'utf-8');
        } catch {
          contents = fs.readFileSync(copyAction.fromPath);
        }
        if (typeof contents === 'string') {
          contents = ejs.render(contents, options);
        }
        fs.writeFileSync(copyAction.toPath, contents, 'binary');
      } else if (stats.isDirectory()) {
        if (!fs.existsSync(copyAction.toPath)) {
          fs.mkdirSync(copyAction.toPath, {recursive: true});
        }
        
        const fromFiles = fs.readdirSync(copyAction.fromPath);
        for (const fromFile of fromFiles) {
          pendingCopies.push({
            fromPath: path.join(copyAction.fromPath, fromFile),
            toPath: path.join(copyAction.toPath, fromFile),
          })
        }
      }
    }

  }
}

async function doPrompt(): Promise<CliOptions> {
  const response: CliOptions = await enquirer.prompt([
    {
      name: 'template',
      type: 'multiselect',
      message: 'What project template would you like to generate?',
      choices: fs.readdirSync(path.join(scriptDir, 'templates')),
      initial: 0,
      required: true,
    },
    {
        name: 'projectName',
        type: 'input',
        message: 'Project developer name:',
        initial: path.parse(workingDir).base,
        required: true,
    },
  ]);

  response.projectLabel = await enquirer.prompt([
      {
        name: 'projectLabel',
        type: 'input',
        message: 'Project display name:',
        initial: response.projectName,
    }
  ]).then((r: CliOptions) => r.projectName)

  return response
}

async function start() {
  const options: CliOptions = await doPrompt();
  const targetPath = options.projectName === path.parse(workingDir).base ? workingDir : path.join(workingDir, options.projectName);
  const templatePath = path.join(scriptDir, 'templates', options.template);

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, {recursive: true});
  }

  const templateRootFileList = fs.readdirSync(templatePath);
  const targetRootFileList = fs.readdirSync(targetPath);

  for (const targetRootFile of targetRootFileList) {
    if (templateRootFileList.includes(targetRootFile)) {
      throw new Error(`The directory "${targetPath}" has content that conflicts with the selected template.`)
    }
  }

  await deepCopy(templatePath, targetPath, options);

  if (fs.existsSync(path.join(targetPath, 'package.json'))) {
    shell.cd(targetPath);
    shell.exec('npm install');
    shell.cd(workingDir);
  }
}

start();