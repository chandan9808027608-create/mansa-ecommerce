# Connecting the store to Supabase

Once this is done, products, the popup ad, uploaded images, admin login and orders all live in Supabase.
The site becomes plain files, so it can be hosted for free on GitHub Pages; `server.py` is no longer needed.

Until `config.js` is filled in, the site keeps working on the local Python server exactly as before.

## 1. Create the project

1. Sign in at https://supabase.com and click **New project**.
2. Pick a name (e.g. `mansa-store`), set a database password (save it somewhere safe), and choose the region closest to Nepal (e.g. **Mumbai** or **Singapore**).
3. Wait a minute or two for it to finish setting up.

## 2. Create the tables

1. In the project, open **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It should say "Success".
3. New query again: paste [`supabase/seed.sql`](supabase/seed.sql) and click **Run**. This loads your full catalogue (all 2,492 products) and the popup ad, replacing any products already there. If you import a new CSV later with `python3 tools/import_products.py file.csv`, it rewrites this file too; run it again in the SQL Editor.

## 3. Create your admin login

1. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". (Only you should have an account.)
2. **Authentication → Users → Add user → Create new user**: enter your email and a strong password, and tick **Auto Confirm User**.
3. Back in **SQL Editor**, run this with your email:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
   Only accounts in this `admins` list can change the store, even if someone else somehow gets a login.

## 4. Connect the site

1. Open **Project Settings → API** (or the **Connect** button at the top).
2. Copy the **Project URL** and the **anon / publishable** key.
3. Paste them into [`config.js`](config.js):
   ```js
   window.MANSA_SUPABASE = {
     url: "https://xxxxxxxx.supabase.co",
     anonKey: "eyJ... or sb_publishable_...",
   };
   ```
   Never use the **service_role** / **secret** key. `config.js` is public, and that key bypasses all the security rules.

## 5. Check it

1. Open the store. Products should load (now from Supabase).
2. Open `admin.html` and sign in with your **email and password**. You'll see a new **Orders** tab.
3. Place a test order on the store, then refresh **Orders** in the admin panel. It should appear there as well as on WhatsApp.

## 6. Host it on GitHub Pages (optional)

1. Push the code to GitHub.
2. In the repository, open **Settings → Pages**, set **Source** to "Deploy from a branch", choose `main` and `/ (root)`, then **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`, and the admin panel at `.../admin.html`.

## Good to know

- **Images**: new uploads go to the Supabase `media` storage bucket. The built-in images in `images/` stay in the site files and are listed in `images/manifest.json`. If you add a file to `images/` by hand, add it to that list too.
- **Orders** store the prices the customer saw at checkout. Always confirm the final price on WhatsApp.
- **Free plan**: Supabase pauses free projects that get no traffic for about a week. Normal store visits count as activity; if it does pause, restore it from the Supabase dashboard. Check Supabase's current plan details for backups.
- **Going back to local mode**: empty the two values in `config.js`. The local mode uses `store.json` and `ad.json`, which won't include changes made while connected to Supabase.
