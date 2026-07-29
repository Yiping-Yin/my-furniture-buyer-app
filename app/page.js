// Placeholder for Task 1, so the deployment pipeline can be verified before
// any features exist. Task 4 replaces this with a redirect to
// /catalogue or /login depending on whether the visitor is logged in.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-stone-800">Furniture Buyer</h1>
        <p className="mt-2 text-stone-500">Setting up — check back shortly.</p>
      </div>
    </main>
  );
}
