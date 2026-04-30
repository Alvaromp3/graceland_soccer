interface LogoProps {
  className?: string;
  size?: number;
}

export default function Logo({ className = '', size = 40 }: LogoProps) {
  return (
    <img
      src="/logo-graceland.png"
      alt="Graceland Logo"
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain',
        backgroundColor: 'transparent',
      }}
    />
  );
}
