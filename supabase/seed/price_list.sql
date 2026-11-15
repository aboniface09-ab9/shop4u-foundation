-- Standard price list (ex VAT), from the Ultra Fish Traders quote of 12 Nov 2026.
-- Business data, safe to load on dev and production. Idempotent.
INSERT INTO public.price_list_items (code, name, description, unit_price_cents, kind, sort_order) VALUES
 ('DISCOVERY', 'Discovery and project setup', 'Understanding your business and audience, collecting your content and brand assets, planning the site structure.', 250000, 'once_off', 10),
 ('DESIGN', 'Design', 'Visual direction in your brand colours, hero imagery, page layouts, and a clean look that works on phone, tablet and desktop.', 500000, 'once_off', 20),
 ('BUILD-7', 'Website build (7 pages)', 'Home, About Us, Products, Sustainability, Export, Contact Us and Privacy Policy, built as custom code.', 800000, 'once_off', 30),
 ('CATALOGUE', 'Product catalogue', 'Launch products with image, description and key information, set up so more can be added easily later.', 150000, 'once_off', 40),
 ('CONTACT-FORM', 'Contact form and email delivery', 'Enquiry form (name, company, email, number, message) with spam protection and consent, delivering enquiries straight to your inbox.', 200000, 'once_off', 50),
 ('SEO-SPEED', 'Search and speed set-up', 'Page titles and descriptions, sitemap, accessibility checks and speed tuning so Google can find and rank the site.', 200000, 'once_off', 60),
 ('LAUNCH', 'Content loading, testing and launch', 'Loading your final content, testing on phones and browsers, two rounds of revisions, and going live.', 150000, 'once_off', 70),
 ('HOSTING', 'Hosting and security', 'Fast, secure hosting on Cloudflare''s global network, security certificate, and protection against attacks.', 25000, 'monthly', 110),
 ('MAINTENANCE', 'Maintenance and monitoring', 'Software and security updates, uptime monitoring, backups of the site''s code, and technical support when something is not working.', 25000, 'monthly', 120),
 ('CONTENT-HOUR', 'Content changes', 'Up to one hour of small edits each month (for example text, contact details or swapping an image).', 25000, 'monthly', 130)
ON CONFLICT (code) DO NOTHING;
