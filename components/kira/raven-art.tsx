export function RavenArt({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 300 320"
      className={small ? "raven-icon" : "raven-art"}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="151" cy="141" r="104" stroke="currentColor" opacity=".14" />
      <circle
        cx="151"
        cy="141"
        r="126"
        stroke="currentColor"
        opacity=".08"
        strokeDasharray="2 7"
      />
      <path
        d="M197 62 180 78 162 73 144 86 126 110 98 131 78 180 58 215 37 244 99 221 81 259 137 227 169 191 185 154 177 120 194 99 223 91 202 80Z"
        fill="currentColor"
        opacity=".1"
      />
      <path
        d="m197 62-17 16-18-5-18 13-18 24-28 21-20 49-20 35-21 29 62-23-18 38 56-32 32-36 16-37-8-34 17-21 29-8-21-11-5-18Z"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity=".6"
      />
      <path
        d="m162 93-27 33-20 47-42 50m75-105-21 58-34 42m68-94-18 55-32 42m53-80-11 36-26 34m43-35-19 20m23-47-42-31m-5 91 14 28 29 9m-17-52 3 39 25 11"
        stroke="currentColor"
        opacity=".5"
      />
      <circle cx="182" cy="87" r="2" fill="currentColor" />
      <path
        d="M23 268h251M152 4v13M152 276v20M10 142h13M278 142h13"
        stroke="currentColor"
        opacity=".25"
      />
      <path d="m151 27 3 5-3 5-3-5Z" fill="currentColor" opacity=".8" />
    </svg>
  );
}
