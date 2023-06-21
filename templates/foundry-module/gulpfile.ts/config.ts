import * as fs from 'fs-extra';
import * as path from 'path';

export interface ConfigJson {
  githubRepository?: string;
}

class Config {

  public getConfig(): ConfigJson {
    const configPath = path.resolve(process.cwd(), 'config.json');
    let response: ConfigJson = {};
  
    if (fs.existsSync(configPath)) {
      const file: ConfigJson = fs.readJSONSync(configPath);
      if (file.githubRepository) {
        response.githubRepository = file.githubRepository;
      }
    }

    return response;
  }

}

export const configJson = new Config();
for (let prop in configJson) {
  if (typeof configJson[prop] === 'function') {
    configJson[prop] = configJson[prop].bind(configJson);
  }
}