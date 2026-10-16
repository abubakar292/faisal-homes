const fs = require('fs');

// 1. PlotMap.tsx
let f = 'src/pages/plots/PlotMap.tsx';
let c = fs.readFileSync(f, 'utf8');
if (c.includes('animate-spin')) {
  c = c.replace(/import \{ .* \} from 'lucide-react';/, `$&
import { BrandLoader } from '../../components/brand';`);
  c = c.replace(/<div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-3"><\/div>\n\s*<p className="text-slate-500 font-medium">Loading Map Data\.\.\.<\/p>/, `<BrandLoader size={56} />`);
  fs.writeFileSync(f, c, 'utf8');
}

// 2. PlotAgreement.tsx
f = 'src/pages/sales/PlotAgreement.tsx';
c = fs.readFileSync(f, 'utf8');
if (c.includes('animate-spin')) {
  // It's a full page load fallback
  c = c.replace(/import \{ .* \} from 'lucide-react';/, `$&
import { PageLoading } from '../../components/brand';`);
  c = c.replace(/<div className="min-h-screen bg-\[#f0f4f8\] flex items-center justify-center p-6">\n\s*<div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-md w-full border border-slate-200">\n\s*<div className="flex justify-center mb-4">\n\s*<span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin block"><\/span>\n\s*<\/div>\n\s*<h2 className="text-lg font-semibold text-slate-800 mb-2">Generating Agreement<\/h2>\n\s*<p className="text-slate-500 text-sm">Please wait while we prepare the official plot agreement document\.\.\.<\/p>\n\s*<\/div>\n\s*<\/div>/, `<PageLoading />`);
  fs.writeFileSync(f, c, 'utf8');
}

// 3. App.tsx
f = 'src/App.tsx';
c = fs.readFileSync(f, 'utf8');
c = c.replace(/import AppLoader from '.\/components\/AppLoader';/, '');
// find fallback={<LoaderSignal />} and replace with fallback={<PageLoading />} if LoaderSignal is used, but wait, earlier we created PageLoading inside LoaderContext. We should just replace AppLoader usages.
// Actually, earlier I added PageLoading.
fs.writeFileSync(f, c, 'utf8');

// Also remove AppLoader.tsx
if (fs.existsSync('src/components/AppLoader.tsx')) {
  fs.unlinkSync('src/components/AppLoader.tsx');
}
