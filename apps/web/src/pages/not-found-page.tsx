import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you are looking for does not exist.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}
