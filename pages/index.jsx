import dynamic from 'next/dynamic';

const NumberGuessingGame = dynamic(
  () => import('../components/NumberGuessingGame'),
  { ssr: false }
);

export default function Home() {
  return <NumberGuessingGame />;
}
