import './globals.css';

export const metadata = {
  title: 'ClaimIt — expense claims for small teams',
  description: 'Send a receipt to Claude, approve it in one click.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
