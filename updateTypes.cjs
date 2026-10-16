const fs = require('fs');

// LoaderContext
let f = 'src/components/brand/LoaderContext.tsx';
let c = fs.readFileSync(f, 'utf8');
c = c.replace(/NodeJS\.Timeout/, 'ReturnType<typeof setTimeout>');
fs.writeFileSync(f, c, 'utf8');

// The 3 files
['src/components/brand/BrandLoader.tsx', 'src/components/brand/RouteLoader.tsx', 'src/components/brand/SplashScreen.tsx'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/rootRef\.current\?\.querySelector\('\[data-part="(.*?)"\]'\)/g, "rootRef.current?.querySelector('[data-part=\"$1\"]') || null");
  // in SplashScreen, wordRef.current etc might be null
  // gsap.set(wordRef.current, ...) might be failing if it's undefined, but refs are initialized to null so it's fine.
  fs.writeFileSync(file, content, 'utf8');
});

// index.html
f = 'index.html';
c = fs.readFileSync(f, 'utf8');
c = c.replace(/href="\/brand\/faisal-mark\.png"/, 'href="/brand/parts/mark-base.png"');
fs.writeFileSync(f, c, 'utf8');
