# Localization and formatting review reference

Use this reference when a change adds or modifies visible UI text, non-visible assistive text, `.resx` resources, placeholders, count text, or directional CSS.

## Review checklist

1. Flag hard-coded user-visible strings and non-visible assistive text, including tooltips, accessible names and descriptions, `aria-label` values, screen-reader-only text, announcements, and live-region content. Define them in `.resx` and import them from the generated resource module. Do not flag dynamic data from an API, such as a user name.
2. Require a translator comment for each string that describes where and how the string appears.
3. Require the translator comment to explain every placeholder, such as `{0}` and `{1}`. Do not lock placeholders; the formatter utility replaces them at runtime. Verify each formatter argument matches the placeholder described in the comment.
4. Keep punctuation inside the localized string.
5. Localize complete sentences, not fragments assembled in code. When placeholders contain React elements, keep the whole sentence in one resource and use a ReactNode-aware formatter such as `StringHelper.formatToArray` instead of concatenation or plain string formatting.
6. For counts in visible UI and screen-reader announcements, use sentence-level interval strings with `StringHelper.formatWithLocalizedCountValue`.
7. Pluralization must include the `0`, `1`, and plural cases. Use plural wording for `0`. Do not infer English singular/plural rules; use split plural resources, interval metadata, and the shared count formatter. Verify all three cases in tests when count behavior changes.
8. Validate remaining localization metadata exactly. Whole-string approval locks and valid-character annotations must use the machine-readable pipeline syntax, not explanatory prose.
9. Consolidate identical strings into an appropriate shared resource when the repository has a suitable shared ownership boundary. Duplicated resources can diverge across translations.
10. Require locale-aware dates and times using the site or user locale and locale skeletons. Reject fixed US field order, separators, AM/PM, and hour cycles, including code copied from legacy UI. Search for an existing repository utility before accepting new formatting logic.
11. Check resource provenance and casing. For newly authored strings, remind the author to lock the string if approval status is uncertain, but do not treat a missing lock tag by itself as a blocking defect because the reviewer may not know whether the string is already approved. Prefer sentence-style casing unless established terminology or inherited approved text requires otherwise.
12. Flag physical-direction CSS such as `margin-left`, `right`, or `border-left` unless an RTL-aware mixin or logical property is used. Check CSS, Sass/Less, CSS-in-JS, and inline styles. For CSS-in-JS used in Fluent V8/V9 style APIs, Fluent already handles auto-flipping for those directional properties, so do not raise an RTL finding there unless the code bypasses Fluent's styling path.
13. Verify claimed resolutions in the actual PR source. A resolved review thread may defer the issue to another PR without fixing the current source.

## Bad and good examples

### Complete translation units

All words, punctuation, and reorderable values must live in one resource.

Bad `.resx` resource:

```text
Created at {0} by
```

Only the date replaces `{0}`; the author must be appended elsewhere, so translators cannot reorder the complete message.

Good `.resx` resource:

```text
Created at {0} by {1}
```

The translator comment explains that `{0}` is the date and `{1}` is the author.

### Translator comments and approval locks

Example `.resx` resource:

```xml
<data name="RecycleBinPageTitle" xml:space="preserve">
  <value>Recycle bin</value>
  <comment>{Locked} VSO:12345 for review. The title of the recycle bin page.</comment>
</data>
```

Use this pattern when you review newly authored strings with approval-lock metadata. The reviewer should verify that the comment gives translators usable context, and that any lock or approval marker follows the repository's machine-readable metadata format instead of freeform prose. For newly added strings, if approval status is unclear, leave a comment prompting the author to lock the string when it is not yet approved; do not raise missing lock metadata alone as a blocking issue.

### Separators and fragments

Bad JavaScript or TypeScript:

```ts
name + " - " + description
```

Good `.resx` resource:

```text
{0} - {1}
```

Format it with the repository utility, such as `Text.format` or `StringHelper.format`, passing `name` and `description` as the placeholder values.

### React elements in localized sentences

Bad React or TSX:

```tsx
<>
  {name}
  {" - "}
  {renderRichText(description)}
</>
```

This fragments the sentence in JSX, which fixes punctuation and ordering instead of letting translators reorder the complete message.

Resource:

```text
{0} - {1}
```

Good:

```tsx
StringHelper.formatToArray(
  strings.nameAndDescription,
  name,
  renderRichText(description, { linkify: false })
)
```

Also reject ordinary string formatting when a localized sentence contains React elements:

```tsx
// Bad
{StringHelper.format(strings.createdAt, date)}{" "}
<Link href={authorUrl}>{author}</Link>
```

```tsx
// Good
StringHelper.formatToArray(
  strings.createdAt,
  date,
  <Link href={authorUrl}>{author}</Link>
)
```

Require one complete resource and a ReactNode-aware formatter so translators can reorder text, punctuation, and placeholder components.

### Count strings

Bad `.resx` resources:

```xml
<data name="SiteSelected" xml:space="preserve">
  <value>{0} {1} selected</value>
  <comment>{0} is the selected count. {1} is the word site or sites.</comment>
</data>
<data name="SiteSelectedInterval" xml:space="preserve">
  <value>0||1||2-</value>
</data>
<data name="SiteSelectedSiteInterval" xml:space="preserve">
  <value>sites||site||sites</value>
</data>
```

This splits one sentence into fragments and makes translation harder in languages that need different word order.

Good `.resx` resources:

```xml
<data name="SiteSelected" xml:space="preserve">
  <value>{0} sites selected||{0} site selected||{0} sites selected</value>
  <comment>{0} is the selected count and must match SiteSelectedInterval.</comment>
</data>
<data name="SiteSelectedInterval" xml:space="preserve">
  <value>0||1||2-</value>
</data>
```

```ts
StringHelper.formatWithLocalizedCountValue(
  strings.SiteSelected,
  strings.SiteSelectedInterval,
  this.props.numSelected
)
```

Review count text at the sentence level, not as singular/plural fragments assembled in code.

### Repository formatters

Bad:

```ts
resource.replace("{0}", value)
```

Reject `.replace("{0}", value)`, local formatting helpers, and manual interpolation when `StringHelper.format`, `Text.format`, or `StringHelper.formatWithLocalizedCountValue` applies. When the localized sentence contains React elements, reject ordinary string formatting and require a ReactNode-aware formatter such as `StringHelper.formatToArray`.

### Localized rich text

Approved markup embedded in a resource must go through the repository's safe rich-text parser, mapped to an allowlisted set of elements such as `<strong>`. Never accept `dangerouslySetInnerHTML` for localized markup.

If the localized text appears inside a checkbox or radio label, do not generate interactive links inside that label. Do not place interactive links inside checkbox or radio labels. Disable linkification there while preserving noninteractive emphasis.

### Localized fallbacks

Treat every fallback reachable from visible UI or an accessibility path as user-facing.

Bad:

```ts
props.text || "This is fallback string"
```

Good:

```ts
props.text || strings.fallbackStr
```

Define `fallbackStr` in `.resx`.
