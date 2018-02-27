/*
 * Copyright (c) 2016, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root  or https://opensource.org/licenses/BSD-3-Clause
 */

'use strict';

import { Stats as fsStats, constants as fsConstants } from 'fs';
import { join as pathJoin, dirname as pathDirname } from 'path';
import { isBoolean as _isBoolean, isNil as _isNil } from 'lodash';
import { Global } from '../global';
import { SfdxError } from '../sfdxError';
import { homedir as osHomedir } from 'os';
import { SfdxUtil } from '../util';
import { ProjectDir } from '../projectDir';

/**
 * The interface for  Config options.
 * @interface
 */
export interface ConfigOptions {
    rootFolder?: string;
    filename?: string;
    isGlobal?: boolean;
    isState?: boolean;
    filePath?: string;
}

/**
 * Represents a json config file that the toolbelt uses to manage settings and
 * state. Global config files are stored in the home directory hidden state
 * folder (.sfdx) and local config files are stored in the project path, either
 * in the hidden state folder or wherever specified.
 */
export class Config {

    /**
     * Helper used to determined what the local and global folder point to.
     * @param {boolean} isGlobal - True if the config should be global. False for local.
     * @returns {Promise<string>} - The filepath of the root folder.
     */
    public static async resolveRootFolder(isGlobal: boolean): Promise<string> {
        if (!_isBoolean(isGlobal)) {
            throw new SfdxError('isGlobal must be a boolean', 'InvalidTypeForIsGlobal');
        }
        return isGlobal ? osHomedir() : await ProjectDir.getPath();
    }

    public static async create<T extends Config>(this: { new(): T }, options: ConfigOptions): Promise<T> {
        const config: T = new this();
        config.options = options;

        if (!config.options.filename) {
            throw new SfdxError('The ConfigOptions filename parameter is invalid.', 'InvalidParameter');
        }

        const _isGlobal: boolean = _isBoolean(config.options.isGlobal) && config.options.isGlobal;
        const _isState: boolean = _isBoolean(config.options.isState) && config.options.isState;

        // Don't let users store config files in homedir without being in the
        // state folder.
        let configRootFolder = config.options.rootFolder ? config.options.rootFolder :
            await Config.resolveRootFolder(config.options.isGlobal);

        if (_isGlobal || _isState) {
            configRootFolder = pathJoin(configRootFolder, Global.STATE_FOLDER);
        }

        config.path = pathJoin(configRootFolder,
            config.options.filePath ? config.options.filePath : '', config.options.filename);

        return config;
    }

    private options: ConfigOptions;
    private path: string;
    private contents: object;

    /**
     * Determines if the config file is read write accessible
     * @param {number} perm - The permission
     * @returns {Promise<boolean>} - returns true if the user has capabilities specified by perm.
     * @see {@link https://nodejs.org/api/fs.html#fs_fs_access_path_mode_callback}
     */
    public async access(perm: number): Promise<boolean> {
        try {
            await SfdxUtil.access(this.getPath(), perm);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Read the config file and set "this.contents"
     * @param {boolean} throwOnNotFound - Optionally indicate if a throw should occur on file read.
     * @returns {Promise<object>} the json contents of the config file
     * @throws {Error} Throws error if there was a problem reading or parsing the file
     */
    public async read(throwOnNotFound: boolean = false): Promise<object> {
        try {
            this.setContents(await SfdxUtil.readJSON(this.getPath()));
            return Promise.resolve(this.contents);
        } catch (err) {
            if (err.code === 'ENOENT') {
                if (!throwOnNotFound) {
                    this.setContents({});
                    return Promise.resolve(this.contents);
                }
            }
            throw err;
        }
    }

    /**
     * Calls json.parse on the file content.
     * @param {boolean} throwOnNotFound - Optionally indicate if a throw should occur on undefined results.
     * @returns { Promise<object> } - The json representation of the config
     * @see SfdxUtil.parseJSON
     */
    public async readJSON(throwOnNotFound: boolean = true): Promise<object> {
        return await this.read(throwOnNotFound);
    }

    /**
     * Write the config file with new contents. If no new contents are passed in
     * it will write this.contents that was set from read().
     *
     * @param {object} newContents the new contents of the file
     * @returns {Promise<object>} the written contents
     */
    public async write(newContents?: any): Promise<object> {
        if (!_isNil(newContents)) {
            this.setContents(newContents);
        }

        await SfdxUtil.mkdirp(pathDirname(this.getPath()));

        await SfdxUtil.writeFile(this.getPath(), JSON.stringify(this.getContents(), null, 4));

        return this.getContents();
    }

    /**
     * Check to see if the config file exists
     *
     * @returns {Promise<boolean>} true if the config file exists and has access false otherwise.
     */
    public async exists(): Promise<boolean> {
        return await this.access(fsConstants.R_OK);
    }

    /**
     * Get the stats of the file
     *
     * @returns {Promise<fs.Stats>} stats The stats of the file.
     */
    public async stat(): Promise<fsStats> {
        return SfdxUtil.stat(this.getPath());
    }

    /**
     * Delete the config file
     *
     * @returns {Promise<boolean>} true if the file was deleted false otherwise
     */
    public async unlink(): Promise<void> {
        const exists = await this.exists();
        if (exists) {
            return await SfdxUtil.unlink(this.getPath());
        }
        throw new SfdxError(`Target file doesn't exist. path: ${this.getPath()}`, 'TargetFileNotFound');
    }

    /**
     * @returns {string} The path to the config file.
     */
    public getPath(): string {
        return this.path;
    }

    /**
     * @returns {string} The config contents from the json config
     */
    public getContents(): object {
        return this.contents || {};
    }

    /**
     * Sets the config contents
     * @param value {any} The target config contents
     * @returns {any}
     */
    public setContents(value: object): void {
        this.contents = value;
    }

    /**
     * @returns {boolean} true if this config is using the global path false otherwise
     */
    public getIsGlobal(): boolean {
        return this.options.isGlobal;
    }
}
