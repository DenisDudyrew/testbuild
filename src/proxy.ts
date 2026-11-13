import { NextRequest, NextResponse } from 'next/server';

// Runs before public-file serving, including encoded legacy URLs.
// Keep auth in the API handler; this rewrite prevents a static-file bypass.
export function proxy(request: NextRequest) {
  let pathname = request.nextUrl.pathname;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    } catch { return new NextResponse(null, { status: 400 }); }
  }
  if (pathname === '/uploads' || pathname.startsWith('/uploads/')) {
    const target = request.nextUrl.clone();
    target.pathname = `/api/files${pathname.slice('/uploads'.length)}`;
    return NextResponse.rewrite(target);
  }
  return NextResponse.next();
}
