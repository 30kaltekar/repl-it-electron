import { app, ipcMain, ClientRequest } from 'electron';
import {
    ElectronWindow,
    Version,
    checkUpdateResult,
    UpdateAssetsUrls,
    githubReleaseResponse,
    decodeReleaseResponse,
    formatBytes,
    launcherStatus,
    downloadUpdateResult
} from '../common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter2 } from 'eventemitter2';
import fetch from 'node-fetch';
import * as childProcess from 'child_process';
import { platform } from 'os';

class Updater {
    pathSep: string = path.sep;
    appPath: string = app.getAppPath() + this.pathSep;
    upperAppPath: string = path.dirname(this.appPath) + this.pathSep;
    userDesktop: string = app.getPath('desktop');
    logFilePath: string = this.userDesktop + 'updater-log.txt';
    appVersion: Version; //app.getVersion()
    logArray: [string] = [''];
    OS: string = '';
    downloadPath: string =
        app.getPath('appData') + 'updaterDownload' + this.pathSep;
    downloadUrls: UpdateAssetsUrls = {
        windowsUrl: '',
        macOSUrl: '',
        linuxUrl: ''
    };
    launcher: Launcher;

    constructor(launcher: Launcher) {
        /*this.appVersion = {
            major: parseInt(app.getVersion().split('.')[0]),
            minor: parseInt(app.getVersion().split('.')[1]),
            patch: parseInt(app.getVersion().split('.')[2]),
            versionString: app.getVersion()
        };*/
        this.appVersion = {
            major: 0,
            minor: 0,
            patch: 5,
            versionString: '0.0.5'
        };
        this.launcher = launcher;
    }

    async checkUpdate(): Promise<checkUpdateResult> {
        try {
            const res: githubReleaseResponse = decodeReleaseResponse(
                await (
                    await fetch(
                        'https://api.github.com/repos/repl-it-discord/repl-it-electron/releases/latest'
                    )
                ).json()
            );

            const tagNames = res.tag_name.split('.');
            const changeLog = res.body;
            const version: Version = {
                major: parseInt(tagNames[0]),
                minor: parseInt(tagNames[1]),
                patch: parseInt(tagNames[2])
            };
            for (let x = 0; x < res.assets.length; x++) {
                const asset = res.assets[x];
                if (asset.name.includes('exe') || asset.name.includes('win')) {
                    this.downloadUrls.windowsUrl = asset.browser_download_url;
                } else if (asset.name.includes('dmg')) {
                    this.downloadUrls.macOSUrl = asset.browser_download_url;
                } else if (asset.name.includes('tar.gz')) {
                    this.downloadUrls.linuxUrl = asset.browser_download_url;
                } else {
                }
            }

            if (
                version.patch > this.appVersion.patch ||
                version.minor > this.appVersion.minor ||
                version.major > this.appVersion.major
            ) {
                return {
                    hasUpdate: true,
                    changeLog: changeLog,
                    version: res.tag_name
                };
            } else {
                return { hasUpdate: false };
            }
        } catch (e) {
            console.error(e);
            return { hasUpdate: false, changeLog: 'error' };
        }
    }

    async downloadUpdate(url: string): Promise<downloadUpdateResult> {
        try {
            const req = await fetch(url);

            const contentLength: number = parseInt(
                req.headers.get('content-length')
            );
            const filename = url.split('/').pop();
            const downloadFile: string = this.downloadPath + filename;
            let downloaded: number = 0;
            if (!fs.existsSync(this.downloadPath)) {
                fs.mkdirSync(this.downloadPath, { recursive: true });
            }
            req.body
                .on('data', (chunk: Buffer) => {
                    downloaded += chunk.length;
                    const percentage = Math.floor(
                        (downloaded / contentLength) * 100
                    );
                    this.launcher.updateStatus({
                        text: `${formatBytes(downloaded)}/${formatBytes(
                            contentLength
                        )}`,
                        percentage: percentage.toString() + '%'
                    });
                })
                .pipe(fs.createWriteStream(downloadFile));
            req.body.on('end', () => {
                this.launcher.updateStatus({ text: 'Download Finished' });
            });
            return { success: true, downloadFilePath: downloadFile };
        } catch (e) {
            return { success: false, error: e };
        }
    }

    afterDownloadWin(path: string) {
        console.log('afterDownloadWin' + path);
        //TODO: open exe installer and exit app
    }

    afterDownloadMac(path: string) {
        //TODO: open dmg and open it.
    }

    afterDownloadLinux(path: string) {
        //TODO:tar.gz and auto-install tar.gz.
    }
}

class Launcher {
    window: ElectronWindow;

    constructor() {
        this.window = new ElectronWindow({
            show: false,
            resizable: false,
            height: 300,
            width: 250,
            frame: false,
            webPreferences: { nodeIntegration: true, devTools: true }
        });
    }

    init() {
        this.window.loadFile('launcher/launcher.html').then();
    }

    updateStatus(status: launcherStatus) {
        this.window.webContents.send('status-update', status);
    }
}

export { Launcher, Updater };
