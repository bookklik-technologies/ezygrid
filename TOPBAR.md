# Ezy suite topbar contract

Keep this specification and the repository-local suite-topbar helper/styles aligned across Ezygrid, Ezynota, and Ezyreka. Each library builds independently; no sibling repository is a runtime dependency.

## Layout

Brand, editable title, flexible space, history, specialist tools, view controls, More, file actions, Export. Actions align right. Omit unsupported capabilities. Keep logos, app accents, file semantics, and existing shortcuts.

56px border-box height; 12px horizontal padding; 28px logos; 36px controls; 18px icons with 1.8px strokes; 6px control radii; 8px between action groups; 2px inside groups. Outfit: 15px/700 brand, 14px/600 title, 14px/500 actions, 14px/600 Export. Title basis 190px, compact 110px, minimum 40px.

Shared light neutrals: surface #ffffff, text #1e2130, border #e4e4ea, hover #f0f0f3. Dark: #191d27, #e5e7eb, #343b49, #292f3c. Focus uses the app accent. Disabled actions use 40% opacity. Export retains the app color and appropriate foreground.

## Container behavior

Observe the editor container, not the viewport. Below 1100px move specialist controls to More. Below 800px hide brand text, reduce the title, and move view/file controls to More. Below 480px move history to More and show icon-only Export. Move actual controls, retaining handlers, state, and accessible names. Keep Ezyreka's 720px editor minimum. More is hidden when it has no actions.

## Interaction and ownership

Use folder-open for Open/Import and save for Save/Backup with precise accessible labels. Ezynota means Import file and Download workspace backup. Canvas fit uses a distinct frame icon, never fullscreen. Menus support arrows, Home/End, Escape, outside dismissal, focus return and viewport clamping. Top-layer popovers avoid clipping in embedded editors. Clean up observers and document listeners on destroy.

Scope styling beneath the editor root and suite topbar classes. Preserve public APIs, document formats, content layout, and independently maintained branding.

## Validation

Check light/dark, long names, disabled history, resize thresholds, embedded containers, and Ezynota/Ezyreka on one page. Verify existing actions manually and run builds/static checks. Ask before running unit tests.
