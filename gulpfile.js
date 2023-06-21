/**
 * Based on https://gitlab.com/tposney/midi-qol/-/blob/master/gulpfile.js
 */

 const glob = require("glob");
 const gulp = require('gulp');
 const fs = require('fs-extra');
 const path = require('path');
 const chalk = require('chalk');
 const archiver = require('archiver');
 const stringify = require('json-stringify-pretty-compact');
 const typescript = require('typescript');
 
 const ts = require('gulp-typescript');
 const less = require('gulp-less');
 const sass = require('gulp-sass');
 const git = require('gulp-git');
 const sourcemaps = require('gulp-sourcemaps');
 
 const exec = require('child_process').exec;
 const argv = require('yargs').argv;
 
 sass.compiler = require('sass');
 
 /**
  * @returns {{
  * 	dataPath: string,
  * 	foundryPath: string,
  * 	githubRepository: string
  * }}
  */
 function getConfig() {
   const configPath = path.resolve(process.cwd(), 'foundryconfig.json');
   let config;
 
   if (fs.existsSync(configPath)) {
     config = fs.readJSONSync(configPath);
     return config;
   } else {
     return;
   }
 }
 
 function getManifest() {
   const json = {};
 
   if (fs.existsSync('src')) {
     json.root = 'src';
   } else {
     json.root = 'dist';
   }
 
   const modulePath = path.join(json.root, 'module.json');
   const systemPath = path.join(json.root, 'system.json');
 
   if (fs.existsSync(modulePath)) {
     json.file = fs.readJSONSync(modulePath);
     json.name = 'module.json';
   } else if (fs.existsSync(systemPath)) {
     json.file = fs.readJSONSync(systemPath);
     json.name = 'system.json';
   } else {
     return;
   }
 
   return json;
 }
 
 function buildManifest() {
   const manifest = getManifest();
 
   /** @type {Promise<string[]>[]} */
   const filePromises = [];
   filePromises.push(new Promise((resolve, reject) => {
     glob('dist/**/*.css', (err, matches) => {
       if (err) {
         reject(err);
         return;
       }
       resolve(matches);
     })
   }));
   filePromises.push(new Promise((resolve, reject) => {
     glob('dist/**/*.hbs', (err, matches) => {
       if (err) {
         reject(err);
         return;
       }
       resolve(matches);
     })
   }));
   
   return Promise.all(filePromises).then(fileNameCollection => {
     /** @type {Set<string>} */
     const cssFiles = new Set();
     /** @type {Set<string>} */
     const hbsFiles = new Set();
     for (const fileNames of fileNameCollection) {
       for (let fileName of fileNames) {
         fileName = fileName.replace(/^(dist|src)\//, '');
         if (fileName.toLowerCase().endsWith('.css')) {
           cssFiles.add(fileName);
         } else if (fileName.toLowerCase().endsWith('.hbs')) {
           hbsFiles.add(fileName);
         }
       }
     }
 
     if (manifest.file.flags == null) {
       manifest.file.flags = {};
     }
     if (Array.isArray(manifest.file.styles)) {
       cssFiles.add(...manifest.file.styles)
     }
     if (Array.isArray(manifest.file.flags.hbsFiles)) {
       hbsFiles.add(...manifest.file.flags.hbsFiles)
     }
     manifest.file.styles = Array.from(cssFiles).sort();
     manifest.file.flags.hbsFiles = Array.from(hbsFiles).sort();
 
     fs.writeFileSync(path.join('dist', manifest.name), JSON.stringify(manifest.file, null, 2));
   })
 }
 
 /**
  * TypeScript transformers
  * @returns {typescript.TransformerFactory<typescript.SourceFile>}
  */
 function createTransformer() {
   /**
    * @param {typescript.Node} node
    */
   function shouldMutateModuleSpecifier(node) {
     if (
       !typescript.isImportDeclaration(node) &&
       !typescript.isExportDeclaration(node)
     )
       return false;
     if (node.moduleSpecifier === undefined) return false;
     if (!typescript.isStringLiteral(node.moduleSpecifier)) return false;
     if (
       !node.moduleSpecifier.text.startsWith('./') &&
       !node.moduleSpecifier.text.startsWith('../')
     )
       return false;
     if (path.extname(node.moduleSpecifier.text) !== '') return false;
     return true;
   }
 
   /**
    * Transforms import/export declarations to append `.js` extension
    * @param {typescript.TransformationContext} context
    */
   function importTransformer(context) {
     return (node) => {
       /**
        * @param {typescript.Node} node
        */
       function visitor(node) {
         if (shouldMutateModuleSpecifier(node)) {
           if (typescript.isImportDeclaration(node)) {
             const newModuleSpecifier = typescript.createLiteral(
               `${node.moduleSpecifier.text}.js`
             );
             return typescript.updateImportDeclaration(
               node,
               node.decorators,
               node.modifiers,
               node.importClause,
               newModuleSpecifier
             );
           } else if (typescript.isExportDeclaration(node)) {
             const newModuleSpecifier = typescript.createLiteral(
               `${node.moduleSpecifier.text}.js`
             );
             return typescript.updateExportDeclaration(
               node,
               node.decorators,
               node.modifiers,
               node.exportClause,
               newModuleSpecifier
             );
           }
         }
         return typescript.visitEachChild(node, visitor, context);
       }
 
       return typescript.visitNode(node, visitor);
     };
   }
 
   return importTransformer;
 }
 
 const tsConfig = ts.createProject('tsconfig.json', {
   getCustomTransformers: (_program) => ({
     after: [createTransformer()],
   }),
 });
 
 /********************/
 /*		BUILD		*/
 /********************/
 
 /**
  * Build TypeScript
  */
 function buildTS() {
   return gulp.src('src/**/*.ts')
     .pipe(sourcemaps.init())
     .pipe(tsConfig())
     .pipe(sourcemaps.write())
     .pipe(gulp.dest('dist'));
 }
 
 /**
  * Build Less
  */
 function buildLess() {
   return gulp.src('src/styles/*.less').pipe(less()).pipe(gulp.dest('dist/styles'));
 }
 
 /**
  * Build SASS
  */
 function buildSASS() {
   return gulp
     .src('src/styles/*.scss')
     .pipe(sass().on('error', sass.logError))
     .pipe(gulp.dest('dist/styles'));
 }
 
 const staticCopyFiles = [
   {from: ['src','lang'], to: ['dist','lang']},
   {from: ['src','fonts'], to: ['dist','fonts']},
   {from: ['src','assets'], to: ['dist','assets']},
   {from: ['src','templates'], to: ['dist','templates']},
   {from: ['src','module.json'], to: ['dist','module.json']},
   {from: ['src','system.json'], to: ['dist','system.json']},
   {from: ['src','template.json'], to: ['dist','template.json']},
 ];
 
 /**
  * Copy static files
  */
 function createCopyFiles(copyFilesArg) {
   return async function copyFiles() {
     const promises = [];
     for (const file of copyFilesArg) {
       if (fs.existsSync(path.join(...file.from))) {
         if (file.options) {
           promises.push(fs.copy(path.join(...file.from), path.join(...file.to), file.options));
         } else {
           promises.push(fs.copy(path.join(...file.from), path.join(...file.to)));
         }
       }
     }
     return await Promise.all(promises);
   }
 }
 
 /**
  * Watch for changes for each build step
  */
 function buildWatch() {
   startFoundry();
   const copyFiles = [...staticCopyFiles, {from: ['src','packs'], to: ['dist','packs'], options: {override: false}}];
   gulp.watch('src/**/*.ts', { ignoreInitial: false }, buildTS);
   gulp.watch('src/**/*.less', { ignoreInitial: false }, buildLess);
   gulp.watch('src/**/*.scss', { ignoreInitial: false }, buildSASS);
   gulp.watch(['dist/**/*.css', 'dist/**/*.hbs'], { ignoreInitial: false }, buildManifest);
   gulp.watch(
     [...copyFiles.map(file => path.join(...file.from)), 'src/*.json'],
     { ignoreInitial: false },
     createCopyFiles(copyFiles)
   );
 }
 
 /********************/
 /*		CLEAN		*/
 /********************/
 
 /**
  * Remove built files from `dist` folder
  * while ignoring source files
  */
 async function clean() {
   const name = path.basename(path.resolve('.'));
   const files = [];
 
   // If the project uses TypeScript
   if (fs.existsSync(path.join('src', `${name}.ts`))) {
     files.push(
       'lang',
       'templates',
       'assets',
       'module',
       `${name}.js`,
       'module.json',
       'system.json',
       'template.json'
     );
   }
 
   // If the project uses Less or SASS
   if (
     fs.existsSync(path.join('src', `${name}.less`)) ||
     fs.existsSync(path.join('src', `${name}.scss`))
   ) {
     files.push('fonts', `${name}.css`);
   }
 
   console.log(' ', chalk.yellow('Files to clean:'));
   console.log('   ', chalk.blueBright(files.join('\n    ')));
 
   // Attempt to remove the files
   try {
     for (const filePath of files) {
       await fs.remove(path.join('dist', filePath));
     }
     return Promise.resolve();
   } catch (err) {
     Promise.reject(err);
   }
 }
 
 /********************/
 /*		LINK		*/
 /********************/
 
 /**
  * Link build to User Data folder
  */
 async function linkUserData() {
   const name = path.basename(path.resolve('.'));
   const config = fs.readJSONSync('foundryconfig.json');
 
   let destDir;
   try {
     if (
       fs.existsSync(path.resolve('.', 'dist', 'module.json')) ||
       fs.existsSync(path.resolve('.', 'src', 'module.json'))
     ) {
       destDir = 'modules';
     } else if (
       fs.existsSync(path.resolve('.', 'dist', 'system.json')) ||
       fs.existsSync(path.resolve('.', 'src', 'system.json'))
     ) {
       destDir = 'systems';
     } else {
       throw Error(
         `Could not find ${chalk.blueBright(
           'module.json'
         )} or ${chalk.blueBright('system.json')}`
       );
     }
 
     let linkDir;
     if (config.dataPath) {
       if (!fs.existsSync(path.join(config.dataPath, 'Data')))
         throw Error('User Data path invalid, no Data directory found');
 
       linkDir = path.join(config.dataPath, 'Data', destDir, name);
     } else {
       throw Error('No User Data path defined in foundryconfig.json');
     }
 
     if (argv.clean || argv.c) {
       console.log(
         chalk.yellow(`Removing build in ${chalk.blueBright(linkDir)}`)
       );
 
       await fs.remove(linkDir);
     } else if (!fs.existsSync(linkDir)) {
       console.log(
         chalk.green(`Copying build to ${chalk.blueBright(linkDir)}`)
       );
       await fs.symlink(path.resolve('./dist'), linkDir);
     }
     return Promise.resolve();
   } catch (err) {
     Promise.reject(err);
   }
 }
 
 /*********************/
 /*		PACKAGE		 */
 /*********************/
 
 /**
  * Package build
  */
 async function packageBuild() {
   const manifest = getManifest();
 
   return new Promise((resolve, reject) => {
     try {
       // Ensure there is a directory to hold all the packaged versions
       fs.ensureDirSync('package');
 
       // Initialize the zip file
       const zipName = `module.zip`;
       const zipFile = fs.createWriteStream(path.join('package', zipName));
       const zip = archiver('zip', { zlib: { level: 9 } });
 
       zipFile.on('close', () => {
         console.log(chalk.green(zip.pointer() + ' total bytes'));
         console.log(
           chalk.green(`Zip file ${zipName} has been written`)
         );
         return resolve();
       });
 
       zip.on('error', (err) => {
         throw err;
       });
 
       zip.pipe(zipFile);
 
       // Add the directory with the final code
       zip.directory('dist/', manifest.file.name);
 
       zip.finalize();
     } catch (err) {
       return reject(err);
     }
   });
 }
 
 /**
  * @param {string} currentVersion
  * @returns {string} version name
  */
 function getVersionFromArgs(currentVersion) {
   const version = argv.update || argv.u;
   if (!version) {
     throw new Error('Missing version number. Use -u <version> (or --update) to specify a version.');
   }
 
   const versionMatch = /^v?(\d{1,}).(\d{1,}).(\d{1,})(-.+)?$/;
   let targetVersion = null;
 
   if (versionMatch.test(version)) {
     targetVersion = version;
   } else {
     targetVersion = currentVersion.replace(
       versionMatch,
       (substring, major, minor, patch, addon) => {
         let target = null;
         if (version.toLowerCase() === 'major') {
           target = `${Number(major) + 1}.0.0`;
         } else if (version.toLowerCase() === 'minor') {
           target = `${major}.${Number(minor) + 1}.0`;
         } else if (version.toLowerCase() === 'patch') {
           target = `${major}.${minor}.${Number(patch) + 1}`;
         }
 
         if (addon) {
           target += addon;
         }
 
         return target;
       }
     );
   }
 
   if (targetVersion == null) {
     throw new Error(chalk.red('Error: Incorrect version arguments. Accepts the following:\n- major\n- minor\n- patch\n- the following patterns: 1.0.0 | 1.0.0-beta'));
   }
   return targetVersion;
 }
 
 /**
  * Update version and URLs in the manifest JSON
  */
 function updateGithubManifest(cb) {
   console.log('updateGithubManifest')
   const packageJson = fs.readJSONSync('package.json');
   const config = getConfig();
   const manifest = getManifest();
 
   if (!config) {
     return cb(Error(chalk.red('foundryconfig.json not found in the ./ (root) folder')));
   }
   if (!manifest) {
     return cb(Error(chalk.red('Manifest JSON not found in the ./src folder')));
   }
   if (!config.githubRepository) {
     return cb(Error(chalk.red('Missing "githubRepository" property in ./foundryconfig.json. Epxected format: <githubUsername>/<githubRepo>')));
   }
 
   try {
     const currentVersion = manifest.file.version;
     let targetVersion = getVersionFromArgs(currentVersion)
 
     if (targetVersion.startsWith('v')) {
       targetVersion = targetVersion.substring(1);
     }
     
     // Don't allow the same version for explicit verions (not 'latest')
     if (targetVersion === currentVersion) {
       return cb(Error(chalk.red('Error: Target version is identical to current version.')));
     }
 
     console.log(`Updating version number to '${targetVersion}'`);
 
     packageJson.version = targetVersion;
 
     manifest.file.version = targetVersion;
     manifest.file.url = `https://github.com/${config.githubRepository}`;
     manifest.file.manifest = `https://github.com/${config.githubRepository}/releases/download/v${targetVersion}/module.json`;
     manifest.file.download = `https://github.com/${config.githubRepository}/releases/download/v${targetVersion}/module.zip`;
 
     fs.writeFileSync(
       'package.json',
       stringify(packageJson, {indent: '  '}),
       'utf8'
     );
     fs.writeFileSync(
       path.join(manifest.root, manifest.name),
       stringify(manifest.file, {indent: '  '}),
       'utf8'
     );
 
     return cb();
   } catch (err) {
     return cb(err);
   }
 }
 
 function validateCleanRepo(cb) {
   return git.status({args: '--porcelain'}, function (err, stdout) {
     if (typeof stdout === 'string' && stdout.length > 0) {
       err = new Error("You must first commit your pending changes");
     }
     if (err) {
       cb(Error(err));
       throw Error(err);
     }
     cb();
   });
 }
 
 function gitCommit() {
   let newVersion = 'v' + getManifest().file.version;
   return gulp.src('.').pipe(git.commit(`Updated to ${newVersion}`));
 }
 
 function gitTag() {
   let newVersion = 'v' + getManifest().file.version;
   return git.tag(
     `${newVersion}`,
     `Updated to ${newVersion}`,
     (err) => {
       if (err) {
         throw err;
       }
     }
   );
 }
 
 function gitPush(cb) {
   git.push('origin', (err) => {
     if (err) {
       cb(err);
       throw err;
     }
     cb();
   });
 }
 
 function gitPushTag(cb) {
   let newVersion = 'v' + getManifest().file.version;
   git.push('origin', newVersion, (err) => {
     if (err) {
       cb(err);
       throw err;
     }
     cb();
   });
 }
 
 const execGit = gulp.series(gitCommit, gitTag, gitPush, gitPushTag);
 
 const execBuild = gulp.parallel(buildTS, buildLess, buildSASS, createCopyFiles([...staticCopyFiles, {from: ['src','packs'], to: ['dist','packs']}]));
 
 function startFoundry() {
   if (!fs.existsSync('foundryconfig.json')) {
     console.warn('Could not start foundry: foundryconfig.json not found in project root');
     return;
   }
   const config = fs.readJSONSync('foundryconfig.json');
   if (!config.dataPath) {
     console.warn('Could not start foundry: foundryconfig.json is missing the property "dataPath"');
   }
   if (!config.foundryPath) {
     console.warn('Could not start foundry: foundryconfig.json is missing the property "foundryPath"');
   }
 
   const cmd = `node "${path.join(config.foundryPath, 'resources', 'app', 'main.js')}" --dataPath="${config.dataPath}"`;
   console.log('starting foundry: ', cmd)
   exec(cmd);
 }
 
 exports.build = gulp.series(clean, execBuild, buildManifest);
 exports.updateSrcPacks = gulp.parallel(createCopyFiles([{from: ['dist','packs'], to: ['src','packs']}]));
 exports.watch = buildWatch;
 exports.clean = clean;
 exports.link = linkUserData;
 exports.package = packageBuild;
 exports.updateManifest = updateGithubManifest;
 exports.test = gitPushTag;
 exports.publish = gulp.series(
   clean,
   validateCleanRepo,
   updateGithubManifest,
   execGit
 );
 