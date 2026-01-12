/**
 * Settings tab for Claude Code Terminal
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type ClaudeCodeTerminalPlugin from './main';
import type { ClaudeCodeSettings, ProjectSource } from './types';
import { DEFAULT_SETTINGS } from './constants';

// Re-export for backwards compatibility
export type { ClaudeCodeSettings };
export { DEFAULT_SETTINGS };

export class ClaudeCodeSettingTab extends PluginSettingTab {
    plugin: ClaudeCodeTerminalPlugin;

    constructor(app: App, plugin: ClaudeCodeTerminalPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Terminal Settings
        containerEl.createEl('h2', { text: 'Terminal Settings' });

        new Setting(containerEl)
            .setName('Shell')
            .setDesc('Path to PowerShell or other shell executable')
            .addText(text => text
                .setPlaceholder('powershell.exe')
                .setValue(this.plugin.settings.shell)
                .onChange(async (value) => {
                    this.plugin.settings.shell = value || 'powershell.exe';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Claude Command')
            .setDesc('Command to start Claude Code')
            .addText(text => text
                .setPlaceholder('claude')
                .setValue(this.plugin.settings.claudeCommand)
                .onChange(async (value) => {
                    this.plugin.settings.claudeCommand = value || 'claude';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-start Claude')
            .setDesc('Automatically run Claude Code when opening the terminal')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoStartClaude)
                .onChange(async (value) => {
                    this.plugin.settings.autoStartClaude = value;
                    await this.plugin.saveSettings();
                }));

        // Appearance Settings
        containerEl.createEl('h2', { text: 'Appearance' });

        new Setting(containerEl)
            .setName('Font Size')
            .setDesc('Terminal font size in pixels')
            .addSlider(slider => slider
                .setLimits(10, 24, 1)
                .setValue(this.plugin.settings.fontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.fontSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Font Family')
            .setDesc('Terminal font family')
            .addText(text => text
                .setPlaceholder('Consolas, Monaco, monospace')
                .setValue(this.plugin.settings.fontFamily)
                .onChange(async (value) => {
                    this.plugin.settings.fontFamily = value || 'Consolas, Monaco, monospace';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Status Badge')
            .setDesc('Show connection status in header')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showStatusBadge)
                .onChange(async (value) => {
                    this.plugin.settings.showStatusBadge = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Project in Header')
            .setDesc('Show inline project picker in terminal header')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showProjectInHeader)
                .onChange(async (value) => {
                    this.plugin.settings.showProjectInHeader = value;
                    await this.plugin.saveSettings();
                }));

        // Project Settings
        containerEl.createEl('h2', { text: 'Project Discovery' });

        new Setting(containerEl)
            .setName('Max Recent Projects')
            .setDesc('Maximum number of recent projects to remember')
            .addSlider(slider => slider
                .setLimits(5, 50, 5)
                .setValue(this.plugin.settings.maxRecentProjects)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxRecentProjects = value;
                    await this.plugin.saveSettings();
                }));

        // Project Sources
        containerEl.createEl('h3', { text: 'Project Sources' });
        containerEl.createEl('p', {
            text: 'Directories to scan for projects. Projects are detected by markers like package.json, Cargo.toml, .git, etc.',
            cls: 'setting-item-description'
        });

        const sourcesContainer = containerEl.createDiv({ cls: 'project-sources-list' });
        this.renderProjectSources(sourcesContainer);

        new Setting(containerEl)
            .setName('Add Project Source')
            .setDesc('Add a directory to scan for projects')
            .addButton(button => button
                .setButtonText('Add Source')
                .onClick(async () => {
                    this.plugin.settings.projectSources.push({
                        type: 'directory',
                        path: '',
                        depth: 2,
                        enabled: true
                    });
                    await this.plugin.saveSettings();
                    this.display(); // Refresh
                }));

        // Recent Projects Management
        containerEl.createEl('h3', { text: 'Recent Projects' });

        const recentCount = this.plugin.settings.recentProjects.length;
        new Setting(containerEl)
            .setName(`${recentCount} recent project${recentCount !== 1 ? 's' : ''} stored`)
            .addButton(button => button
                .setButtonText('Clear Recent')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.recentProjects = [];
                    await this.plugin.saveSettings();
                    this.display(); // Refresh
                }));
    }

    private renderProjectSources(container: HTMLElement) {
        container.empty();

        for (let i = 0; i < this.plugin.settings.projectSources.length; i++) {
            const source = this.plugin.settings.projectSources[i];
            this.renderProjectSource(container, source, i);
        }
    }

    private renderProjectSource(container: HTMLElement, source: ProjectSource, index: number) {
        const sourceEl = container.createDiv({ cls: 'project-source-item' });

        new Setting(sourceEl)
            .setName(`Source ${index + 1}`)
            .addText(text => text
                .setPlaceholder('Path to directory')
                .setValue(source.path)
                .onChange(async (value) => {
                    this.plugin.settings.projectSources[index].path = value;
                    await this.plugin.saveSettings();
                }))
            .addSlider(slider => slider
                .setLimits(1, 5, 1)
                .setValue(source.depth || 2)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.projectSources[index].depth = value;
                    await this.plugin.saveSettings();
                }))
            .addToggle(toggle => toggle
                .setValue(source.enabled)
                .setTooltip('Enable/disable this source')
                .onChange(async (value) => {
                    this.plugin.settings.projectSources[index].enabled = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setIcon('trash')
                .setTooltip('Remove source')
                .onClick(async () => {
                    this.plugin.settings.projectSources.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.display(); // Refresh
                }));

        // Depth label
        const depthLabel = sourceEl.createDiv({ cls: 'project-source-depth-label' });
        depthLabel.setText(`Scan depth: ${source.depth || 2} level${(source.depth || 2) > 1 ? 's' : ''}`);
    }
}
