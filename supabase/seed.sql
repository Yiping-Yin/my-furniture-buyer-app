-- Sample catalogue. Safe to re-run: clears and reinserts.
-- Order line items reference product ids, so reseeding products also clears
-- orders and resets everyone's spending back to zero.
-- Apply with: npm run db:apply

truncate table public.order_items, public.orders, public.products restart identity cascade;
update public.profiles set total_spent = 0.00;

-- image_url values must match the slugs in scripts/make-images.mjs.
insert into public.products (name, description, price, image_url) values
  ('Oak Dining Table',      'Solid oak table seating six, with a hand-oiled finish.',      1249.00, '/images/oak-dining-table.svg'),
  ('Linen Three-Seat Sofa', 'Deep-seated sofa in stone-grey linen with feather cushions.', 1899.00, '/images/linen-three-seat-sofa.svg'),
  ('Walnut Dining Chair',   'Curved walnut frame with a woven cord seat.',                  329.00, '/images/walnut-dining-chair.svg'),
  ('Upholstered Bed Frame', 'Queen frame with a padded headboard in oatmeal weave.',       1450.00, '/images/upholstered-bed-frame.svg'),
  ('Open Oak Bookshelf',    'Five-shelf open unit, wall-anchored, in pale oak.',            675.00, '/images/open-oak-bookshelf.svg'),
  ('Brass Floor Lamp',      'Adjustable arc lamp with an antique brass shade.',             245.00, '/images/brass-floor-lamp.svg'),
  ('Compact Writing Desk',  'Two-drawer desk sized for small rooms.',                       540.00, '/images/compact-writing-desk.svg'),
  ('Ash Counter Stool',     'Backless stool in solid ash, kitchen-counter height.',         185.00, '/images/ash-counter-stool.svg'),
  ('Two-Door Wardrobe',     'Full-height wardrobe with hanging rail and shelf.',           1620.00, '/images/two-door-wardrobe.svg'),
  ('Handwoven Wool Rug',    'Undyed wool rug, 200 x 300 cm, woven in concentric bands.',    780.00, '/images/handwoven-wool-rug.svg');
