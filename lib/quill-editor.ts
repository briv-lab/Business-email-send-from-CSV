import type QuillType from 'quill';
import type { ToolbarConfig } from 'quill/modules/toolbar.js';

type QuillConstructor = typeof import('quill').default;
type EditorBlot = Parameters<QuillType['getIndex']>[0];

const MIN_IMAGE_WIDTH = 64;
const HANDLE_DIRECTIONS = ['nw', 'ne', 'sw', 'se'] as const;

export const EDITOR_TOOLBAR: ToolbarConfig = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'image'],
  ['clean'],
];

export const EDITOR_FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'bullet',
  'link',
  'image',
  'width',
  'height',
  'alt',
];

let quillLoader: Promise<QuillConstructor> | null = null;
let hasRegisteredModules = false;

function normalizeDimension(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return String(Math.round(numericValue));
}

function createImageResizeModule(Quill: QuillConstructor) {
  return class ImageResizeModule {
    quill: QuillType;
    overlay: HTMLDivElement;
    activeImage: HTMLImageElement | null = null;
    cleanupCallbacks: Array<() => void> = [];

    constructor(quill: QuillType) {
      this.quill = quill;
      this.overlay = document.createElement('div');
      this.overlay.className = 'ql-image-resize-overlay';
      this.overlay.hidden = true;

      for (const direction of HANDLE_DIRECTIONS) {
        const handle = document.createElement('button');
        handle.className = `ql-image-resize-handle ql-image-resize-handle-${direction}`;
        handle.type = 'button';
        handle.setAttribute('aria-label', `Resize image ${direction}`);
        handle.addEventListener('mousedown', (event) => this.startResize(event, direction));
        this.overlay.appendChild(handle);
      }

      this.quill.container.appendChild(this.overlay);

      const handleRootClick = (event: MouseEvent) => {
        const target = event.target;
        if (target instanceof HTMLImageElement) {
          this.selectImage(target);
          return;
        }

        if (target instanceof Node && !this.overlay.contains(target)) {
          this.hideOverlay();
        }
      };

      const handleSelectionChange = () => {
        if (!this.activeImage) {
          return;
        }

        const selection = this.quill.getSelection();
        if (!selection) {
          this.repositionOverlay();
          return;
        }

        this.repositionOverlay();
      };

      const handleTextChange = () => {
        if (this.activeImage && !this.quill.root.contains(this.activeImage)) {
          this.hideOverlay();
          return;
        }

        this.repositionOverlay();
      };

      const handleDocumentMouseDown = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) {
          return;
        }

        if (this.overlay.contains(target) || target === this.activeImage) {
          return;
        }

        if (!this.quill.container.contains(target)) {
          this.hideOverlay();
        }
      };

      const handleScroll = () => this.repositionOverlay();
      const handleResize = () => this.repositionOverlay();

      this.quill.root.addEventListener('click', handleRootClick);
      this.quill.root.addEventListener('scroll', handleScroll, { passive: true });
      document.addEventListener('mousedown', handleDocumentMouseDown);
      window.addEventListener('resize', handleResize);
      this.quill.on(Quill.events.SELECTION_CHANGE, handleSelectionChange);
      this.quill.on(Quill.events.TEXT_CHANGE, handleTextChange);

      this.cleanupCallbacks.push(
        () => this.quill.root.removeEventListener('click', handleRootClick),
        () => this.quill.root.removeEventListener('scroll', handleScroll),
        () => document.removeEventListener('mousedown', handleDocumentMouseDown),
        () => window.removeEventListener('resize', handleResize),
        () => this.quill.off(Quill.events.SELECTION_CHANGE, handleSelectionChange),
        () => this.quill.off(Quill.events.TEXT_CHANGE, handleTextChange),
      );
    }

    destroy() {
      this.hideOverlay();
      for (const cleanup of this.cleanupCallbacks) {
        cleanup();
      }
      this.cleanupCallbacks = [];
      this.overlay.remove();
    }

    private selectImage(image: HTMLImageElement) {
      if (this.activeImage === image) {
        this.repositionOverlay();
        return;
      }

      this.hideOverlay();
      this.activeImage = image;
      this.activeImage.classList.add('ql-resizable-image');
      this.overlay.hidden = false;
      this.repositionOverlay();

      const blot = Quill.find(image);
      if (blot && blot !== this.quill) {
        const index = this.quill.getIndex(blot as EditorBlot);
        this.quill.setSelection(index, 1, Quill.sources.SILENT);
      }
    }

    private hideOverlay() {
      if (this.activeImage) {
        this.activeImage.classList.remove('ql-resizable-image');
        this.activeImage = null;
      }

      this.overlay.hidden = true;
    }

    private repositionOverlay() {
      if (!this.activeImage || !document.body.contains(this.activeImage)) {
        this.hideOverlay();
        return;
      }

      const imageRect = this.activeImage.getBoundingClientRect();
      if (imageRect.width === 0 || imageRect.height === 0) {
        this.hideOverlay();
        return;
      }

      const containerRect = this.quill.container.getBoundingClientRect();
      this.overlay.style.left = `${imageRect.left - containerRect.left}px`;
      this.overlay.style.top = `${imageRect.top - containerRect.top}px`;
      this.overlay.style.width = `${imageRect.width}px`;
      this.overlay.style.height = `${imageRect.height}px`;
    }

    private startResize(event: MouseEvent, direction: (typeof HANDLE_DIRECTIONS)[number]) {
      if (!this.activeImage) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const image = this.activeImage;
      const startRect = image.getBoundingClientRect();
      const editorWidth = this.quill.root.clientWidth;
      const startWidth = startRect.width;
      const aspectRatio = startRect.width / Math.max(startRect.height, 1);
      const horizontalDirection = direction.includes('e') ? 1 : -1;

      const updatePreview = (nextWidth: number) => {
        const clampedWidth = Math.max(
          MIN_IMAGE_WIDTH,
          Math.min(Math.round(nextWidth), Math.round(editorWidth)),
        );
        const nextHeight = Math.max(1, Math.round(clampedWidth / aspectRatio));
        image.style.width = `${clampedWidth}px`;
        image.style.height = `${nextHeight}px`;
        this.repositionOverlay();
      };

      const handlePointerMove = (moveEvent: MouseEvent) => {
        const deltaX = (moveEvent.clientX - event.clientX) * horizontalDirection;
        updatePreview(startWidth + deltaX);
      };

      const handlePointerUp = () => {
        document.removeEventListener('mousemove', handlePointerMove);
        document.removeEventListener('mouseup', handlePointerUp);

        const finalWidth = normalizeDimension(image.style.width) ?? normalizeDimension(image.getAttribute('width'));
        const finalHeight = normalizeDimension(image.style.height) ?? normalizeDimension(image.getAttribute('height'));

        image.style.removeProperty('width');
        image.style.removeProperty('height');

        if (!finalWidth || !finalHeight) {
          this.repositionOverlay();
          return;
        }

        const blot = Quill.find(image);
        if (!blot || blot === this.quill) {
          return;
        }

        const index = this.quill.getIndex(blot as EditorBlot);
        this.quill.formatText(
          index,
          1,
          { width: finalWidth, height: finalHeight },
          Quill.sources.USER,
        );
        this.selectImage(image);
      };

      document.addEventListener('mousemove', handlePointerMove);
      document.addEventListener('mouseup', handlePointerUp);
    }
  };
}

function registerQuillModules(Quill: QuillConstructor) {
  if (hasRegisteredModules) {
    return;
  }

  Quill.register('modules/imageResize', createImageResizeModule(Quill), true);
  hasRegisteredModules = true;
}

export function getEditorModules() {
  return {
    toolbar: EDITOR_TOOLBAR,
    imageResize: true,
  };
}

export function normalizeEditorHtml(html: string) {
  const trimmed = html.trim();
  if (trimmed === '<p><br></p>') {
    return '';
  }

  return html;
}

export async function loadQuill() {
  if (!quillLoader) {
    quillLoader = import('quill').then(({ default: Quill }) => {
      registerQuillModules(Quill);
      return Quill;
    });
  }

  return quillLoader;
}
