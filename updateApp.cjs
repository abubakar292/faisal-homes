const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Imports
if (!content.includes('SplashScreen')) {
  content = content.replace(
    /import AppLoader from '\.\/components\/AppLoader';/,
    `import AppLoader from './components/AppLoader';
import { SplashScreen, LoaderProvider, useLoader } from './components/brand';
import { useEffect, useState } from 'react';`
  );
}

// 2. LoaderSignal
if (!content.includes('LoaderSignal')) {
  content = content.replace(
    /const PageSuspense: React\.FC/,
    `const LoaderSignal: React.FC = () => {
  const { begin, end } = useLoader();
  useEffect(() => {
    begin();
    return () => end();
  }, [begin, end]);
  return null;
};

const PageSuspense: React.FC`
  );
}

// 3. Update PageSuspense
content = content.replace(
  /fallback=\{[\s\S]*?<div className="flex flex-col items-center justify-center min-h-\[60vh\]"[\s\S]*?<\/Suspense>/,
  `fallback={<LoaderSignal />}>
    {children}
  </Suspense>`
);

// 4. Update ProtectedRoute
content = content.replace(
  /if \(loading\) return <AppLoader \/>;/,
  `if (loading) return null;`
);

// 5. Update AppInner
if (content.includes('if (loading) {') && content.includes('<AppLoader key="loader" />')) {
  content = content.replace(
    /const AppInner: React\.FC = \(\) => \{\n\s*const \{ loading \} = useAuth\(\);\n[\s\S]*?return \(/,
    `const AppInner: React.FC = () => {
  const { loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen ready={!loading} onDone={() => setSplashDone(true)} />}`
  );

  content = content.replace(
    /<\/PageSuspense>\n\s*\);\n\};\n\n\/\/ ─── Root/,
    `    </PageSuspense>
    </>
  );
};

// ─── Root`
  );
}

// 6. Wrap in LoaderProvider
if (!content.includes('<LoaderProvider>')) {
  content = content.replace(
    /<AuthProvider>/,
    `<AuthProvider>\n      <LoaderProvider>`
  );
  content = content.replace(
    /<\/AuthProvider>/,
    `      </LoaderProvider>\n    </AuthProvider>`
  );
}

fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('App.tsx updated');
