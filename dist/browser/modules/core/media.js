document.currentScript.__ezygridRegister("core/media", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaStore = void 0;
const model_1 = require("@ezygrid/model");
/** Floating media layer (§30/§32): images and shapes above the grid. */
class MediaStore {
    objects = [];
    addImage(image) {
        // Scheme allowlist (L2): http: images in exported workbooks leak IPs
        // (tracking pixels); only https/data/blob sources are accepted.
        if (!/^(https:|data:image\/(png|jpeg|gif|webp);base64,|blob:)/i.test(image.src ?? '')) {
            throw new Error('image src must be an https:, data:image (base64), or blob: URL');
        }
        const full = { ...image, kind: 'image', id: image.id ?? (0, model_1.createId)('media') };
        this.objects.push(full);
        return full;
    }
    addShape(shape) {
        const full = { ...shape, kind: 'shape', id: shape.id ?? (0, model_1.createId)('media') };
        this.objects.push(full);
        return full;
    }
    remove(id) {
        this.objects = this.objects.filter((o) => o.id !== id);
    }
    all() {
        return this.objects;
    }
}
exports.MediaStore = MediaStore;

});
