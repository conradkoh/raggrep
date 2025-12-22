/**
 * Configuration loader
 * 
 * Loads configuration from JSON files and environment variables.
 */

const fs = require('fs');
const path = require('path');

const ENV = process.env.NODE_ENV || 'development';

function loadConfig() {
  const configDir = path.join(__dirname, '../../config');
  
  // Load default config
  const defaultConfig = loadJsonFile(path.join(configDir, 'default.json'));
  
  // Load environment-specific config
  const envConfigPath = path.join(configDir, `${ENV}.json`);
  const envConfig = fs.existsSync(envConfigPath) 
    ? loadJsonFile(envConfigPath) 
    : {};
  
  // Merge configs (env overrides default)
  const config = deepMerge(defaultConfig, envConfig);
  
  // Apply environment variable overrides
  applyEnvOverrides(config);
  
  return config;
}

function loadJsonFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(content);
}

function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

function applyEnvOverrides(config) {
  // Database
  if (process.env.DATABASE_HOST) config.database.host = process.env.DATABASE_HOST;
  if (process.env.DATABASE_PORT) config.database.port = parseInt(process.env.DATABASE_PORT);
  if (process.env.DATABASE_NAME) config.database.name = process.env.DATABASE_NAME;
  
  // Server
  if (process.env.PORT) config.server.port = parseInt(process.env.PORT);
  if (process.env.HOST) config.server.host = process.env.HOST;
  
  // Auth
  if (process.env.JWT_SECRET) config.auth.jwt.secret = process.env.JWT_SECRET;
  
  // Logging
  if (process.env.LOG_LEVEL) config.logging.level = process.env.LOG_LEVEL;
}

module.exports = {
  config: loadConfig(),
  loadConfig,
};





