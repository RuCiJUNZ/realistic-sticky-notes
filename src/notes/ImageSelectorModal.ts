// src/views/ImageSelectorModal.ts

import { App, Modal, Notice, TFile, normalizePath } from 'obsidian';

export class ImageSelectorModal extends Modal {
    private onSelect: (relativePath: string) => void;
    private basePath: string;
    // 定义子文件夹名称
    private readonly ASSET_SUBFOLDER = 'Assets';

    constructor(app: App, basePath: string, onSelect: (relativePath: string) => void) {
        super(app);
        this.basePath = basePath;
        this.onSelect = onSelect;
    }

    // 计算完整的资源文件夹路径： 例如 "BrainCore/Assets"
    private get fullAssetPath(): string {
        return normalizePath(`${this.basePath}/${this.ASSET_SUBFOLDER}`);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('bc-image-modal');
        contentEl.createEl('h2', { text: '选择背景图片' });

        const uploadContainer = contentEl.createDiv({ cls: 'bc-img-upload-area' });
        const fileInput = uploadContainer.createEl('input', {
            type: 'file',
            attr: { accept: 'image/*' }
        });
        const uploadBtn = uploadContainer.createEl('button', { text: '上传新图片' });

        uploadBtn.onclick = async () => {
            if (fileInput.files && fileInput.files.length > 0) {
                await this.handleUpload(fileInput.files[0]);
                this.refreshGallery();
            } else {
                new Notice('请先选择一张图片');
            }
        };

        contentEl.createEl('hr');
        this.galleryContainer = contentEl.createDiv({ cls: 'bc-img-gallery' });
        this.refreshGallery();
    }

    private galleryContainer: HTMLElement;

    private refreshGallery() {
        this.galleryContainer.empty();

        const folderPath = this.fullAssetPath;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder) {
            this.galleryContainer.createEl('p', { text: `暂无图片，上传的图片将存放在 /${folderPath} 目录` });
            return;
        }

        // ⭐ 关键修改：只过滤出在用户设定的 basePath/Assets 下的图片
        const files = this.app.vault.getFiles()
            .filter(f => f.path.startsWith(folderPath + '/') && this.isImage(f));

        if (files.length === 0) {
            this.galleryContainer.createEl('p', { text: '暂无图片' });
            return;
        }

        files.forEach(file => {
            const imgContainer = this.galleryContainer.createDiv({ cls: 'bc-gallery-item' });
            const resourcePath = this.app.vault.getResourcePath(file);
            const img = imgContainer.createEl('img', { attr: { src: resourcePath } });

            img.onclick = () => {
                // ⭐ 关键修改：从完整路径中移除 basePath 部分
                // 比如：从 "test/Assets/1.png" 变成 "Assets/1.png"
                let relativePath = file.path;
                if (file.path.startsWith(this.basePath)) {
                    // 去掉前面的 basePath 和可能的斜杠
                    relativePath = file.path.substring(this.basePath.length).replace(/^[\\\/]+/, '');
                }

                this.onSelect(relativePath);
                this.close();
            };

            imgContainer.createEl('span', { text: file.name });
        });
    }

    private async handleUpload(file: File) {
        const folderPath = this.fullAssetPath;

        // 1. 递归创建文件夹（确保 basePath 和 Assets 都存在）
        const parts = folderPath.split('/');
        let currentPath = "";
        for (const part of parts) {
            currentPath = normalizePath(currentPath ? `${currentPath}/${part}` : part);
            if (!this.app.vault.getAbstractFileByPath(currentPath)) {
                await this.app.vault.createFolder(currentPath);
            }
        }

        const arrayBuffer = await file.arrayBuffer();
        let fileName = file.name;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        if (this.app.vault.getAbstractFileByPath(filePath)) {
            const timestamp = new Date().getTime();
            const parts = fileName.split('.');
            const ext = parts.pop();
            const name = parts.join('.');
            fileName = `${name}-${timestamp}.${ext}`;
        }

        const finalPath = normalizePath(`${folderPath}/${fileName}`);

        try {
            await this.app.vault.createBinary(finalPath, arrayBuffer);
            new Notice(`图片已上传至 ${folderPath}`);
        } catch (error) {
            console.error(error);
            new Notice('上传失败');
        }
    }

    private isImage(file: TFile) {
        return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(file.extension.toLowerCase());
    }

    onClose() {
        this.contentEl.empty();
    }
}