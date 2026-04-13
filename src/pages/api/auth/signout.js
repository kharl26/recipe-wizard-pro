// POST /api/auth/signout
// Signs the user out and clears the session cookies.

export async function POST({ locals, redirect }) {
  await locals.supabase.auth.signOut();
  return redirect('/');
}
