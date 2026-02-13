// src/utils/ConfirmModal.ts
import { App, Modal, Setting, ButtonComponent } from 'obsidian';

export class ConfirmModal extends Modal {
    private title: string;
    private message: string;
    private onConfirm: () => void;

    constructor(app: App, title: string, message: string, onConfirm: () => void) {
        super(app);
        this.title = title;
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.title });
        contentEl.createEl('p', { text: this.message });

        const buttonContainer = contentEl.createDiv({ cls: 'bc-modal-buttons' });
        // 简单样式：让按钮右对齐
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '12px';
        buttonContainer.style.marginTop = '24px';

        new Setting(buttonContainer)
            .addButton((btn) =>
                btn
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.close();
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText('Delete')
                    .setCta() // Call To Action 样式 (通常是高亮色)
                    .setWarning() // 警告样式 (红色)
                    .onClick(() => {
                        this.onConfirm();
                        this.close();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}