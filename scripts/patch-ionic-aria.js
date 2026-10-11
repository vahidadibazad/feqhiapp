#!/usr/bin/env node
/**
 * Patches @ionic/core to remove aria-* watchers from ion-button.
 *
 * The Ionic Button component registers watchers on `aria-checked`, `aria-label`
 * and `aria-pressed` attributes that call `onAriaChanged`. In some combinations
 * of Angular + Ionic + Stencil, this method is invoked before the component
 * instance is created, causing a `Cannot read properties of undefined
 * (reading 'onAriaChanged')` error. Since the app does not use
 * ion-input-password-toggle (the only consumer of this feature), removing the
 * watchers is safe.
 *
 * The patch must be applied:
 *  - After `npm install` (through the `postinstall` script).
 *  - In CI before building.
 *
 * This script is idempotent: running it multiple times has no additional effect.
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const TARGETS = [
    // ESM bundles (used by webpack/Angular)
    'node_modules/@ionic/core/dist/esm/ionic.js',
    'node_modules/@ionic/core/dist/esm/loader.js',
    'node_modules/@ionic/core/dist/esm/ion-button_2.entry.js',

    // CJS bundles (used by Node/SSR and some tooling)
    'node_modules/@ionic/core/dist/cjs/ion-button_2.cjs.entry.js',

    // Stencil "collection" sources
    'node_modules/@ionic/core/dist/collection/components/button/button.js',

    // Hydrate (SSR / prerender)
    'node_modules/@ionic/core/hydrate/index.js',
    'node_modules/@ionic/core/hydrate/index.mjs',
];

/**
 * Patterns to remove from each file.
 * We keep the "disabled" watcher and drop the three aria watchers.
 */
const PATTERNS = [
    // 1) JSON metadata used by ionic.js / loader.js
    //    "disabled":[{"disabledChanged":0}],"aria-checked":[{"onAriaChanged":0}],"aria-label":[{"onAriaChanged":0}],"aria-pressed":[{"onAriaChanged":0}]
    //    -> "disabled":[{"disabledChanged":0}]
    {
        name: 'metadata JSON (ionic.js / loader.js)',
        regex: /"disabled":\[\{"disabledChanged":0\}\](?:"aria-checked":\[\{"onAriaChanged":0\}\])?(?:"aria-label":\[\{"onAriaChanged":0\}\])?(?:"aria-pressed":\[\{"onAriaChanged":0\}\])?/g,
        replacement: '"disabled":[{"disabledChanged":0}]',
    },

    // 2) Entry ESM/CJS format:
    //    "aria-checked": [{ "onAriaChanged": 0 }],
    //    "aria-label":    [{ "onAriaChanged": 0 }],
    //    "aria-pressed":  [{ "onAriaChanged": 0 }]
    //    Note: The entry files have the following shape:
    //      "disabled": [{
    //              "disabledChanged": 0
    //          }],
    //      "aria-checked": [{
    //              "onAriaChanged": 0
    //          }],
    //      "aria-label": [...],
    //      "aria-pressed": [...]
    //    So we remove the "aria-*" entries but keep "disabled".
    {
        name: 'entry format (ion-button_2.entry.js)',
        regex: /\s*"aria-checked":\s*\[\{\s*"onAriaChanged":\s*0\s*\}\]\s*,?\s*"aria-label":\s*\[\{\s*"onAriaChanged":\s*0\s*\}\]\s*,?\s*"aria-pressed":\s*\[\{\s*"onAriaChanged":\s*0\s*\}\]\s*,?/g,
        replacement: '',
    },

    // 3) Hydrate format:
    //    "aria-checked": [{
    //            "onAriaChanged": 0
    //        }],
    //    ...
    {
        name: 'hydrate format (hydrate/index.js / index.mjs)',
        regex: /\s*,?\s*"aria-checked":\s*\[\{\s*"onAriaChanged":\s*0\s*\}\]\s*,?\s*"aria-label":\s*\[\{\s*"onAriaChanged":\s*0\s*\}\]\s*,?\s*"aria-pressed":\s*\[\{\s*"onAriaChanged":\s*0\s*\}\]/g,
        replacement: '',
    },

    // 4) Collection source format:
    //    {
    //        "propName": "aria-checked",
    //        "methodName": "onAriaChanged"
    //    }, {
    //        "propName": "aria-label",
    //        "methodName": "onAriaChanged"
    //    }, {
    //        "propName": "aria-pressed",
    //        "methodName": "onAriaChanged"
    //    }
    {
        name: 'collection format (button.js)',
        regex: /\s*,\s*\{\s*"propName":\s*"aria-checked",\s*"methodName":\s*"onAriaChanged"\s*\}\s*,\s*\{\s*"propName":\s*"aria-label",\s*"methodName":\s*"onAriaChanged"\s*\}\s*,\s*\{\s*"propName":\s*"aria-pressed",\s*"methodName":\s*"onAriaChanged"\s*\}/g,
        replacement: '',
    },
];

let totalPatched = 0;
let totalSkipped = 0;

for (const relative of TARGETS) {
    const absolute = path.join(ROOT, relative);

    if (!fs.existsSync(absolute)) {
        console.log(`[patch-ionic-aria] skip (not found): ${relative}`);
        totalSkipped++;
        continue;
    }

    let content = fs.readFileSync(absolute, 'utf8');
    let fileChanged = false;

    for (const { name, regex, replacement } of PATTERNS) {
        const before = content;
        content = content.replace(regex, replacement);

        if (content !== before) {
            fileChanged = true;
            console.log(`[patch-ionic-aria] ${relative}: applied "${name}"`);
        }
    }

    if (fileChanged) {
        fs.writeFileSync(absolute, content, 'utf8');
        totalPatched++;
    } else {
        console.log(`[patch-ionic-aria] no change needed: ${relative}`);
        totalSkipped++;
    }
}

console.log(`[patch-ionic-aria] done. patched: ${totalPatched}, unchanged: ${totalSkipped}`);