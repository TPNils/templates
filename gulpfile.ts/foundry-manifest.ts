import * as glob from 'glob';
import * as fs from 'fs-extra';
import * as path from 'path';
import { buildMeta } from './build-meta';

interface FoundryCompatibility {
  /** The Package will not function before this version */
  minimum?: string;
  /** Verified compatible up to this version */
  verified?: string
  /** The Package will not function after this version */;
  maximum?: string;
}

type FoundryFlags = {[flag: string]: any};

interface FoundryRelationship<TYPE extends string = 'world' | 'system' | 'module'> {
  /** The id of the related package */
  id: string;
  /** The type of the related package */
  type: TYPE;
  /** An explicit manifest URL, otherwise learned from the Foundry web server */
  manifest?: string;
  /** The compatibility data with this related Package */
  compatibility?: FoundryCompatibility;
  /** The reason for this relationship */
  reason?: string;
}

/** @deprecated */
export interface FoundryManifestJsonV8 {
  /** @deprecated The machine-readable unique package name, should be lower-case with no spaces or special characters */
  name: string;
  /** The human-readable package title, containing spaces and special characters */
  title: string;
  /** An optional package description, may contain HTML */
  description?: string;
  /** @deprecated */
  author?: string;
  authors: Array<{
    name: string;
    email?: string;
    url?: string;
    discord?: string;
  }>;
  /** A web url where more details about the package may be found */
  url?: string;
  /** A web url or relative file path where license details may be found */
  license?: string;
  /** A web url or relative file path where readme instructions may be found */
  readme?: string;
  /** A web url where bug reports may be submitted and tracked */
  bugs?: string;
  /** A web url where notes detailing package updates are available */
  changelog?: string;
  flags?: FoundryFlags;

  // Package versioning
  /** The current package version */
  version: string;
  /** @deprecated A minimum version of the core Foundry software which is required to use this package */
  minimumCoreVersion?: string;
  /** @deprecated A maximum version of the core Foundry software beyond which compatibility is not guaranteed */
  compatibleCoreVersion?: string;

  // Included content
  /** An array of urls or relative file paths for JavaScript files which should be included */
  scripts?: string[];
  /** An array of urls or relative file paths for ESModule files which should be included */
  esmodules?: string[];
  /** An array of urls or relative file paths for CSS stylesheet files which should be included */
  styles?: string[];
  /** An array of language data objects which are included by this package */
  languages?: Array<{
    /** A string language code which is validated by Intl.getCanonicalLocales */
    lang: string;
    /** The human-readable language name */
    name: string;
    /** The relative path to included JSON translation strings */
    path: string;
    /** Only apply this set of translations when a specific system is being used */
    system?: string;
    /** Only apply this set of translations when a specific module is active */
    module?: string;
  }>;
  packs?: Array<{
    name: string;
    label: string;
    path: string;
    entity: "Actor" | "Item" | "Scene" | "JournalEntry" | "Macro" | "RollTable" | "Playlist";
    private?: boolean;
    system?: boolean;
  }>;

  // Package dependencies
  /** @deprecated */
  system?: string[];
  /** @deprecated */
  dependencies?: Array<{
    /** Package name */
    name: string;
    type: 'module' | 'system';
    manifest?: string;
  }>;
  /** Whether to require a package-specific socket namespace for this package */
  socket?: boolean;

  // Package downloading
  /** A publicly accessible web URL which provides the latest available package manifest file. Required in order to support module updates. */
  manifest?: string;
  /** A publicly accessible web URL where the source files for this package may be downloaded. Required in order to support module installation. */
  download?: string;
  /** Whether this package uses the protected content access system. */
  protected?: boolean;
}

export interface FoundryManifestJsonV10 extends Omit<FoundryManifestJsonV8, 'name' | 'minimumCoreVersion' | 'compatibleCoreVersion' | 'dependencies' | 'system' | 'packs'> {
  /** The machine-readable unique package id, should be lower-case with no spaces or special characters */
  id: string;
  /** The compatibility of this version with the core Foundry software */
  compatibility?: FoundryCompatibility
  media?: {
    type?: string;
    url?: string;
    caption?: string;
    loop?: boolean;
    thumbnail?: string;
    flags?: FoundryFlags;
  };
  packs?: Array<{
    name: string;
    label: string;
    path: string;
    type: "Actor" | "Item" | "Scene" | "JournalEntry" | "Macro" | "RollTable" | "Playlist";
    system?: boolean;
    private?: boolean;
    flags?: FoundryFlags;
  }>;
  relationships: {
    /** Systems that this Package supports, all of them optional */
    systems?: Array<FoundryRelationship<'system'>>;
    /** Packages that are required for base functionality */
    requires?: Array<FoundryRelationship>;
    conflicts?: Array<FoundryRelationship>;
  }
  exclusive: boolean;
}

export interface FoundryManifestJsonV11 extends Omit<FoundryManifestJsonV10, 'relationships'> {
  relationships: FoundryManifestJsonV10['relationships'] & {
    recommends?: Array<FoundryRelationship>;
  },
}

export type FoundryManifestJson = {
  type: 'module' | 'system';
  file: FoundryManifestJsonV11;
};
type FoundryManifestJsonFile = Partial<FoundryManifestJsonV8 & FoundryManifestJsonV11>;

class FoundryManifest {

  private manifest: FoundryManifestJson;
  public getManifest(): FoundryManifestJson {
    if (this.manifest == null) {
      const modulePath = path.join(buildMeta.getSrcPath(), 'module.json');
      const systemPath = path.join(buildMeta.getSrcPath(), 'system.json');
      let json: FoundryManifestJsonFile;
      let type: FoundryManifestJson['type'];

      if (fs.existsSync(modulePath)) {
        json = fs.readJSONSync(modulePath);
        type = 'module';
      } else if (fs.existsSync(systemPath)) {
        json = fs.readJSONSync(systemPath);
        type = 'system';
      } else {
        throw new Error(`No file found: ${modulePath} OR ${systemPath}`)
      }

      this.manifest = {
        type: type,
        file: FoundryManifest.toV11(json),
      }
    }
    return this.manifest;
  }

  private static toV11(input: FoundryManifestJsonFile): FoundryManifestJsonV11 {
    const v10: Partial<FoundryManifestJsonV11> = {};
    v10.authors = input.authors;
    if (input.author) {
      if (v10.authors == null) {
        v10.authors = [];
      }
      input.authors!.push({name: input.author})
    }
    v10.bugs = input.bugs;
    v10.changelog = input.changelog;
    if (input.compatibility) {
      v10.compatibility = input.compatibility;
    } else {
      v10.compatibility = {
        minimum: input.minimumCoreVersion,
        verified: input.compatibleCoreVersion,
      };
    }
    v10.description = input.description;
    v10.download = input.download;
    v10.esmodules = input.esmodules;
    v10.flags = input.flags;
    v10.id = input.id ?? input.name;
    v10.languages = input.languages;
    v10.license = input.license;
    v10.manifest = input.manifest;
    if (input.packs) {
      v10.packs = [];
      for (const pack of input.packs) {
        if (pack.type != null) {
          v10.packs.push(pack);
        } else {
          v10.packs.push({
            name: pack.name,
            label: pack.label,
            path: pack.path,
            type: pack.entity,
            system: pack.system,
            private: pack.private,
            flags: pack.flags,
          })
        }
      }
    }
    v10.protected = input.protected;
    v10.readme = input.readme;
    const relationshipRequiredById = new Map<string, FoundryRelationship>();
    const relationshipSystemsById = new Map<string, FoundryRelationship<'system'>>();
    if (input.dependencies) {
      for (const module of input.dependencies) {
        relationshipRequiredById.set(module.name, {id: module.name, type: module.type, manifest: module.manifest});
      }
    }
    if (input.system) {
      for (const system of input.system) {
        relationshipSystemsById.set(system, {id: system, type: 'system'});
      }
    }
    if (input.relationships?.requires) {
      for (const required of input.relationships.requires) {
        relationshipRequiredById.set(required.id, required);
      }
    }
    if (input.relationships?.systems) {
      for (const system of input.relationships.systems) {
        relationshipSystemsById.set(system.id, system);
      }
    }
    v10.relationships = {
      requires: Array.from(relationshipRequiredById.values()),
      systems: Array.from(relationshipSystemsById.values()),
      conflicts: input.relationships?.conflicts,
      recommends: input.relationships?.recommends,
    };
    v10.scripts = input.scripts;
    v10.socket = input.socket;
    v10.styles = input.styles;
    v10.title = input.title;
    v10.url = input.url;
    v10.version = input.version;

    return v10 as FoundryManifestJsonV10;
  }

  private static injectV9(input: FoundryManifestJsonV10): FoundryManifestJsonV10 & FoundryManifestJsonV8 {
    const injected: FoundryManifestJsonV8 & FoundryManifestJsonV10 = JSON.parse(JSON.stringify(input));
    
    if (input.compatibility) {
      injected.minimumCoreVersion = input.compatibility.minimum;
      injected.compatibleCoreVersion = input.compatibility.verified ?? input.compatibility.maximum ?? input.compatibility.minimum;
    }
    injected.name = input.id;
    injected.packs = input.packs?.map(p => ({...p, entity: p.type}));
    const relationshipModulesById = new Map<string, FoundryRelationship<'module'>>();
    const relationshipSystemsById = new Map<string, FoundryRelationship<'system'>>();

    const relationships: FoundryRelationship[] = [];
    if (input.relationships?.requires) {
      relationships.push(...input.relationships.requires)
    }
    if (input.relationships?.systems) {
      relationships.push(...input.relationships.systems)
    }
    for (const relationship of relationships) {
      switch (relationship.type) {
        case 'module': {
          relationshipModulesById.set(relationship.id, relationship as FoundryRelationship<'module'>);
          break;
        }
        case 'system': {
          relationshipSystemsById.set(relationship.id, relationship as FoundryRelationship<'system'>);
          break;
        }
      }
    }
    injected.dependencies = Array.from(relationshipModulesById.values()).map(d => ({name: d.id, type: d.type as any, manifest: d.type}));
    injected.system = Array.from(relationshipSystemsById.keys());

    return injected;
  }

  private static async injectFromOutput(input: FoundryManifestJsonV10, destPath: string): Promise<FoundryManifestJsonV10> {
    const injected: FoundryManifestJsonV10 = JSON.parse(JSON.stringify(input));

    const filePromises: Promise<string[]>[] = [];
    filePromises.push(new Promise<string[]>((resolve, reject) => {
      glob(path.join(destPath, '**/*.css'), (err: any, matches: string[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(matches);
      })
    }));
    filePromises.push(new Promise<string[]>((resolve, reject) => {
      glob(path.join(destPath, '**/*.hbs'), (err: any, matches: string[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(matches);
      })
    }));
  
    const fileNameCollection = await Promise.all(filePromises)
    const cssFiles = new Set<string | null>();
    const hbsFiles = new Set<string | null>();
    for (const fileNames of fileNameCollection) {
      for (let fileName of fileNames) {
        fileName = path.normalize(fileName);
        // Remove the destination path prefix
        fileName = fileName.substring(destPath.length + path.sep.length);
        fileName = fileName.replace(path.sep, '/');
        if (fileName.toLowerCase().endsWith('.css')) {
          cssFiles.add(fileName);
        } else if (fileName.toLowerCase().endsWith('.hbs')) {
          hbsFiles.add(fileName);
        }
      }
    }

    if (Array.isArray(input.styles)) {
      for (const value of input.styles) {
        cssFiles.add(value)
      }
    }
    cssFiles.delete(null);

    if (Array.isArray(input.flags?.hbsFiles)) {
      for (const value of input.flags!.hbsFiles) {
        hbsFiles.add(value)
      }
    }
    hbsFiles.delete(null);

    injected.styles = Array.from(cssFiles as Set<string>).sort();
    if (injected.flags == null) {
      injected.flags = {};
    }
    injected.flags.hbsFiles = Array.from(hbsFiles).sort();
    return injected;
  }

  public createBuildManifest(): () => Promise<void> {
    const foundryManifest = this;
    return async function buildManifest() {
      return foundryManifest.saveManifest();
    }
  }

  /**
   * @param source if true, update the source manifest
   */
  public async saveManifest({overrideManifest, source}: {overrideManifest?: FoundryManifestJsonV10, source?: boolean} = {}): Promise<void> {
    const manifest = foundryManifest.getManifest();
    let fileJson: any = overrideManifest ?? manifest.file;
    
    if (source) {
      fileJson = this.sortProperties(fileJson);
      fs.writeFileSync(path.join(buildMeta.getSrcPath(), `${manifest.type}.json`), JSON.stringify(fileJson, null, 2));
    } else {
      for (const dest of buildMeta.getDestPath()) {
        fileJson = await FoundryManifest.injectFromOutput(fileJson, dest);
    
        const minimumCompatibility = (fileJson as FoundryManifestJsonV10).compatibility?.minimum;
        if (minimumCompatibility && Number(minimumCompatibility.split('.')[0]) <= 9) {
          fileJson = FoundryManifest.injectV9(fileJson);
        }
        
        fileJson = this.sortProperties(fileJson);
        fs.writeFileSync(path.join(dest, `${manifest.type}.json`), JSON.stringify(fileJson, null, 2));
      }
    }
  }

  private sortProperties<T extends Record<string, any>>(obj: T): T {
    const propertyOrder: Array<keyof FoundryManifestJsonFile | keyof T> = [
      'id',
      'name',
      'title',
      'version',
      'compatibility',
      'minimumCoreVersion',
      'compatibleCoreVersion',
      'description',
      'author',
      'authors',
      'url',
      'manifest',
      'download',
      'media',
      'license',
      'readme',
      'bugs',
      'changelog',
      'flags',
      'scripts',
      'esmodules',
      'styles',
      'languages',
      'packs',
      'relationships',
      'system',
      'dependencies',
      'socket',
      'protected',
      'exclusive',
    ];

    const shalowClone: Partial<T> = {};
    {
      const extraProperties: typeof propertyOrder = [];
      for (let key in obj) {
        shalowClone[key] = obj[key];
        delete obj[key];
        if (!propertyOrder.includes(key) && !extraProperties.includes(key)) {
          extraProperties.push(key);
        }
      }
      propertyOrder.push(...extraProperties.sort());
    }

    for (const key of propertyOrder) {
      if (key in shalowClone) {
        obj[key] = shalowClone[key];
      }
    }

    return obj;
  }

}

export const foundryManifest = new FoundryManifest();
for (let prop in foundryManifest) {
  if (typeof foundryManifest[prop] === 'function') {
    foundryManifest[prop] = foundryManifest[prop].bind(foundryManifest);
  }
}