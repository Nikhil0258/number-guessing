// pages/index.jsx
import dynamic from 'next/dynamic';

const NumberGuessingGame = dynamic(
  () => import('../components/NumberGuessingGame'),
  { ssr: false } // force client-side only (we use browser APIs)
);

export default function Home() {
  return <NumberGuessingGame />;
}
