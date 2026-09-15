type Props = { message: string | null };

/** エラーの表示。読み上げにも届くよう role="alert" を付ける */
export function ErrorMessage({ message }: Props) {
  if (message === null) {
    return null;
  }

  return (
    <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}
