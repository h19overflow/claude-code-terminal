/**
 * ProjectSwitcher - Modal for searching and switching projects
 * Enhanced with virtual scrolling for large project lists
 */

import { Modal, App, setIcon } from 'obsidian';
import type { Project } from '../types';
import { ProjectManager } from '../services/ProjectManager';
import { formatRelativeTime, truncatePath } from '../utils';

// Virtual scrolling constants
const ITEM_HEIGHT = 56; // pixels per project item
const HEADER_HEIGHT = 28; // pixels per section header
const VISIBLE_BUFFER = 5; // extra items to render above/below viewport
const MAX_RENDER_WITHOUT_VIRTUAL = 50; // use simple render for small lists

interface VirtualItem {
    type: 'header' | 'project';
    data: Project | string;
    index: number; // global index for selection
    top: number; // pixel position from container top
}

export class ProjectSwitcher extends Modal {
    private projectManager: ProjectManager;
    private onSelect: (project: Project) => void;
    private searchInput: HTMLInputElement | null = null;
    private resultsContainer: HTMLElement | null = null;
    private scrollContainer: HTMLElement | null = null;
    private projects: Project[] = [];
    private selectedIndex: number = 0;
    private currentProjectPath: string | null;

    // Virtual scrolling state
    private virtualItems: VirtualItem[] = [];
    private totalHeight: number = 0;
    private scrollTop: number = 0;
    private containerHeight: number = 300; // default, updated on render
    private isLoading: boolean = false;
    private loadingIndicator: HTMLElement | null = null;

    constructor(
        app: App,
        projectManager: ProjectManager,
        currentProjectPath: string | null,
        onSelect: (project: Project) => void
    ) {
        super(app);
        this.projectManager = projectManager;
        this.currentProjectPath = currentProjectPath;
        this.onSelect = onSelect;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('claude-project-switcher');

        // Header
        const header = contentEl.createDiv({ cls: 'project-switcher-header' });
        const iconEl = header.createSpan({ cls: 'project-switcher-icon' });
        setIcon(iconEl, 'folder-open');
        header.createSpan({ text: 'Switch Project', cls: 'project-switcher-title' });

        // Loading indicator
        this.loadingIndicator = header.createSpan({ cls: 'project-switcher-loading' });
        this.loadingIndicator.style.display = 'none';

        // Search input
        const searchContainer = contentEl.createDiv({ cls: 'project-switcher-search' });
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search projects...',
            cls: 'project-switcher-input'
        });

        // Virtual scroll container
        this.scrollContainer = contentEl.createDiv({ cls: 'project-switcher-scroll' });
        this.scrollContainer.style.height = `${this.containerHeight}px`;
        this.scrollContainer.style.overflow = 'auto';
        this.scrollContainer.style.position = 'relative';

        // Results container (positioned absolutely for virtual scrolling)
        this.resultsContainer = this.scrollContainer.createDiv({ cls: 'project-switcher-results' });
        this.resultsContainer.style.position = 'relative';

        // Keyboard shortcuts hint
        const hints = contentEl.createDiv({ cls: 'project-switcher-hints' });
        hints.innerHTML = `
            <span><kbd>↑↓</kbd> Navigate</span>
            <span><kbd>Enter</kbd> Select</span>
            <span><kbd>Esc</kbd> Close</span>
        `;

        // Event listeners
        this.searchInput.addEventListener('input', () => this.handleSearch());
        this.searchInput.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.scrollContainer.addEventListener('scroll', () => this.handleScroll());

        // Setup scan progress callbacks
        this.projectManager.setScanCallbacks({
            onScanStart: () => this.showLoading(true),
            onScanComplete: () => this.showLoading(false)
        });

        // Focus input
        this.searchInput.focus();

        // Initial load
        await this.loadProjects();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.projectManager.setScanCallbacks({});
    }

    private showLoading(show: boolean) {
        this.isLoading = show;
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = show ? 'inline-block' : 'none';
            this.loadingIndicator.setText(show ? 'Scanning...' : '');
        }
    }

    private async loadProjects() {
        this.projects = await this.projectManager.searchProjects('');
        this.buildVirtualItems();
        this.renderVirtual();
    }

    private async handleSearch() {
        const query = this.searchInput?.value || '';
        this.projects = await this.projectManager.searchProjects(query);
        this.selectedIndex = 0;
        this.buildVirtualItems();
        this.renderVirtual();
    }

    private handleScroll() {
        if (!this.scrollContainer) return;
        this.scrollTop = this.scrollContainer.scrollTop;
        this.renderVirtual();
    }

    private handleKeydown(e: KeyboardEvent) {
        const projectItems = this.virtualItems.filter(i => i.type === 'project');
        const maxIndex = projectItems.length - 1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, maxIndex);
                this.scrollToSelected();
                this.renderVirtual();
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.scrollToSelected();
                this.renderVirtual();
                break;

            case 'Enter':
                e.preventDefault();
                const selectedItem = projectItems[this.selectedIndex];
                if (selectedItem && selectedItem.type === 'project') {
                    this.selectProject(selectedItem.data as Project);
                }
                break;

            case 'Escape':
                this.close();
                break;
        }
    }

    /**
     * Build virtual item list with positions
     */
    private buildVirtualItems() {
        this.virtualItems = [];
        let top = 0;
        let projectIndex = 0;

        // Group: Recent (has lastOpened) vs All
        const recentProjects = this.projects.filter(p => p.lastOpened);
        const otherProjects = this.projects.filter(p => !p.lastOpened);

        if (recentProjects.length > 0) {
            this.virtualItems.push({
                type: 'header',
                data: 'Recent',
                index: -1,
                top
            });
            top += HEADER_HEIGHT;

            for (const project of recentProjects) {
                this.virtualItems.push({
                    type: 'project',
                    data: project,
                    index: projectIndex++,
                    top
                });
                top += ITEM_HEIGHT;
            }
        }

        if (otherProjects.length > 0) {
            if (recentProjects.length > 0) {
                this.virtualItems.push({
                    type: 'header',
                    data: 'All Projects',
                    index: -1,
                    top
                });
                top += HEADER_HEIGHT;
            }

            for (const project of otherProjects) {
                this.virtualItems.push({
                    type: 'project',
                    data: project,
                    index: projectIndex++,
                    top
                });
                top += ITEM_HEIGHT;
            }
        }

        this.totalHeight = top;
    }

    /**
     * Scroll to keep selected item visible
     */
    private scrollToSelected() {
        if (!this.scrollContainer) return;

        const selectedItem = this.virtualItems.find(
            i => i.type === 'project' && i.index === this.selectedIndex
        );
        if (!selectedItem) return;

        const itemTop = selectedItem.top;
        const itemBottom = itemTop + ITEM_HEIGHT;

        if (itemTop < this.scrollTop) {
            this.scrollContainer.scrollTop = itemTop;
        } else if (itemBottom > this.scrollTop + this.containerHeight) {
            this.scrollContainer.scrollTop = itemBottom - this.containerHeight;
        }
    }

    /**
     * Render with virtual scrolling
     */
    private renderVirtual() {
        if (!this.resultsContainer || !this.scrollContainer) return;

        // Use simple render for small lists
        if (this.virtualItems.length <= MAX_RENDER_WITHOUT_VIRTUAL) {
            this.renderSimple();
            return;
        }

        this.resultsContainer.empty();
        this.resultsContainer.style.height = `${this.totalHeight}px`;

        if (this.projects.length === 0) {
            const emptyState = this.resultsContainer.createDiv({ cls: 'project-switcher-empty' });
            emptyState.createSpan({ text: this.isLoading ? 'Scanning projects...' : 'No projects found' });
            return;
        }

        // Calculate visible range
        const startY = Math.max(0, this.scrollTop - VISIBLE_BUFFER * ITEM_HEIGHT);
        const endY = this.scrollTop + this.containerHeight + VISIBLE_BUFFER * ITEM_HEIGHT;

        // Render only visible items
        for (const item of this.virtualItems) {
            const itemBottom = item.top + (item.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT);

            if (itemBottom < startY || item.top > endY) {
                continue; // Skip items outside viewport
            }

            if (item.type === 'header') {
                this.renderHeader(item.data as string, item.top);
            } else {
                this.renderProjectItem(item.data as Project, item.index, item.top);
            }
        }
    }

    /**
     * Simple render for small lists (no virtual scrolling)
     */
    private renderSimple() {
        if (!this.resultsContainer) return;
        this.resultsContainer.empty();
        this.resultsContainer.style.height = 'auto';

        if (this.projects.length === 0) {
            const emptyState = this.resultsContainer.createDiv({ cls: 'project-switcher-empty' });
            emptyState.createSpan({ text: this.isLoading ? 'Scanning projects...' : 'No projects found' });
            return;
        }

        for (const item of this.virtualItems) {
            if (item.type === 'header') {
                const headerEl = this.resultsContainer.createDiv({ cls: 'project-switcher-section-header' });
                headerEl.createSpan({ text: item.data as string });
            } else {
                this.createProjectItemSimple(item.data as Project, item.index);
            }
        }

        // Scroll selected into view
        const selectedEl = this.resultsContainer.querySelector('.project-item.selected');
        selectedEl?.scrollIntoView({ block: 'nearest' });
    }

    /**
     * Render a section header (virtual mode)
     */
    private renderHeader(text: string, top: number) {
        if (!this.resultsContainer) return;

        const headerEl = this.resultsContainer.createDiv({ cls: 'project-switcher-section-header' });
        headerEl.style.position = 'absolute';
        headerEl.style.top = `${top}px`;
        headerEl.style.left = '0';
        headerEl.style.right = '0';
        headerEl.createSpan({ text });
    }

    /**
     * Render a project item (virtual mode)
     */
    private renderProjectItem(project: Project, index: number, top: number) {
        if (!this.resultsContainer) return;

        const isSelected = index === this.selectedIndex;
        const isCurrent = project.path === this.currentProjectPath;

        const item = this.resultsContainer.createDiv({
            cls: `project-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`
        });
        item.style.position = 'absolute';
        item.style.top = `${top}px`;
        item.style.left = '0';
        item.style.right = '0';
        item.style.height = `${ITEM_HEIGHT}px`;
        item.dataset.index = String(index);

        // Icon
        const iconEl = item.createDiv({ cls: 'project-item-icon' });
        setIcon(iconEl, project.icon || 'folder');

        // Content
        const content = item.createDiv({ cls: 'project-item-content' });
        const nameRow = content.createDiv({ cls: 'project-item-name-row' });
        nameRow.createSpan({ text: project.name, cls: 'project-item-name' });

        if (isCurrent) {
            nameRow.createSpan({ text: 'Current', cls: 'project-item-badge' });
        }

        const pathEl = content.createDiv({ cls: 'project-item-path' });
        pathEl.setText(truncatePath(project.path, 60));

        // Meta (last opened)
        if (project.lastOpened) {
            const meta = item.createDiv({ cls: 'project-item-meta' });
            meta.setText(formatRelativeTime(project.lastOpened));
        }

        // Click handler
        item.addEventListener('click', () => this.selectProject(project));

        // Hover handler
        item.addEventListener('mouseenter', () => {
            this.selectedIndex = index;
            this.renderVirtual();
        });
    }

    /**
     * Create project item (simple mode - no absolute positioning)
     */
    private createProjectItemSimple(project: Project, index: number) {
        if (!this.resultsContainer) return;

        const isSelected = index === this.selectedIndex;
        const isCurrent = project.path === this.currentProjectPath;

        const item = this.resultsContainer.createDiv({
            cls: `project-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`
        });

        // Icon
        const iconEl = item.createDiv({ cls: 'project-item-icon' });
        setIcon(iconEl, project.icon || 'folder');

        // Content
        const content = item.createDiv({ cls: 'project-item-content' });
        const nameRow = content.createDiv({ cls: 'project-item-name-row' });
        nameRow.createSpan({ text: project.name, cls: 'project-item-name' });

        if (isCurrent) {
            nameRow.createSpan({ text: 'Current', cls: 'project-item-badge' });
        }

        const pathEl = content.createDiv({ cls: 'project-item-path' });
        pathEl.setText(truncatePath(project.path, 60));

        // Meta (last opened)
        if (project.lastOpened) {
            const meta = item.createDiv({ cls: 'project-item-meta' });
            meta.setText(formatRelativeTime(project.lastOpened));
        }

        // Click handler
        item.addEventListener('click', () => this.selectProject(project));

        // Hover handler
        item.addEventListener('mouseenter', () => {
            this.selectedIndex = index;
            this.renderSimple();
        });
    }

    private selectProject(project: Project) {
        this.onSelect(project);
        this.close();
    }
}

/**
 * Quick project picker shown inline in terminal header
 */
export class InlineProjectPicker {
    private container: HTMLElement;
    private projectManager: ProjectManager;
    private currentProject: Project | null;
    private onSelect: (project: Project) => void;
    private isExpanded: boolean = false;
    private dropdownEl: HTMLElement | null = null;

    constructor(
        container: HTMLElement,
        projectManager: ProjectManager,
        currentProject: Project | null,
        onSelect: (project: Project) => void
    ) {
        this.container = container;
        this.projectManager = projectManager;
        this.currentProject = currentProject;
        this.onSelect = onSelect;
        this.render();
    }

    setCurrentProject(project: Project | null) {
        this.currentProject = project;
        this.render();
    }

    private render() {
        this.container.empty();
        this.container.addClass('inline-project-picker');

        // Current project display
        const display = this.container.createDiv({ cls: 'project-picker-display' });
        display.addEventListener('click', () => this.toggleDropdown());

        const iconEl = display.createSpan({ cls: 'project-picker-icon' });
        setIcon(iconEl, this.currentProject?.icon || 'folder');

        display.createSpan({
            text: this.currentProject?.name || 'Select Project',
            cls: 'project-picker-name'
        });

        const chevron = display.createSpan({ cls: 'project-picker-chevron' });
        setIcon(chevron, 'chevron-down');
    }

    private async toggleDropdown() {
        if (this.isExpanded) {
            this.closeDropdown();
        } else {
            await this.openDropdown();
        }
    }

    private async openDropdown() {
        this.isExpanded = true;
        this.container.addClass('expanded');

        this.dropdownEl = this.container.createDiv({ cls: 'project-picker-dropdown' });

        const recentProjects = this.projectManager.getRecentProjects().slice(0, 5);

        if (recentProjects.length === 0) {
            this.dropdownEl.createDiv({
                text: 'No recent projects',
                cls: 'project-picker-empty'
            });
        } else {
            for (const project of recentProjects) {
                this.createDropdownItem(project);
            }
        }

        // Browse all button
        const browseBtn = this.dropdownEl.createDiv({ cls: 'project-picker-browse' });
        const browseIcon = browseBtn.createSpan();
        setIcon(browseIcon, 'search');
        browseBtn.createSpan({ text: 'Browse all projects...' });
        browseBtn.addEventListener('click', () => {
            this.closeDropdown();
            // Emit event to open full modal - handled by parent
            this.container.dispatchEvent(new CustomEvent('open-project-modal'));
        });

        // Close on outside click
        document.addEventListener('click', this.handleOutsideClick);
    }

    private createDropdownItem(project: Project) {
        if (!this.dropdownEl) return;

        const item = this.dropdownEl.createDiv({ cls: 'project-picker-item' });

        const iconEl = item.createSpan({ cls: 'project-picker-item-icon' });
        setIcon(iconEl, project.icon || 'folder');

        item.createSpan({ text: project.name, cls: 'project-picker-item-name' });

        if (project.path === this.currentProject?.path) {
            const checkEl = item.createSpan({ cls: 'project-picker-item-check' });
            setIcon(checkEl, 'check');
        }

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onSelect(project);
            this.closeDropdown();
        });
    }

    private closeDropdown() {
        this.isExpanded = false;
        this.container.removeClass('expanded');
        this.dropdownEl?.remove();
        this.dropdownEl = null;
        document.removeEventListener('click', this.handleOutsideClick);
    }

    private handleOutsideClick = (e: MouseEvent) => {
        if (!this.container.contains(e.target as Node)) {
            this.closeDropdown();
        }
    };

    destroy() {
        document.removeEventListener('click', this.handleOutsideClick);
    }
}
