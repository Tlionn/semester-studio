import { mkdir, copyFile, access } from 'node:fs/promises';
await mkdir('dist/vendor', {recursive:true});
await copyFile('node_modules/xlsx/dist/xlsx.full.min.js', 'dist/vendor/xlsx.full.min.js');
await copyFile('node_modules/xlsx/LICENSE', 'dist/vendor/XLSX-LICENSE.txt');
for (const file of ['index.html','styles.css','workload.css','workload-ui.js','availability.js','app.js','scheduler.js','imports.js','demo.js','worker.js']) await access('dist/' + file);
console.log('Static app is ready in dist/');
