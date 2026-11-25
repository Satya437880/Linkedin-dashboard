"use client";
import { useActionState } from "react";
import { addMessage, type PasteState } from "@/app/paste/actions";
import { IconAlert } from "./Icons";
import { SubmitButton } from "./SubmitButton";
import { Field } from "./ui";

const initial: PasteState = { errors: {}, values: { name: "", url: "", headline: "", direction: "inbound", text: "" } };

export function PasteForm({ csrf }: { csrf: string }) {
  const [state, action] = useActionState(addMessage, initial);
  const { errors, values } = state;
  return (
    <form action={action} noValidate className="card flex flex-col gap-6 p-4 md:p-8">
      <input type="hidden" name="csrf" value={csrf} />
      {Object.keys(errors).length > 0 && (
        <div role="alert" className="alert alert-error">
          <IconAlert className="mt-0.5 shrink-0" />
          <span>{errors.form ?? "Please fix the highlighted fields."}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field id="name" label="Full name" error={errors.name}>
          <input id="name" name="name" defaultValue={values.name} required autoComplete="off" aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "name-error" : undefined} className="input" />
        </Field>
        <Field id="direction" label="Who wrote it">
          <select id="direction" name="direction" defaultValue={values.direction} className="input">
            <option value="inbound">Their reply</option>
            <option value="outbound">My message</option>
          </select>
        </Field>
      </div>
      <Field id="linkedinUrl" label="LinkedIn profile link" hint="Optional. Helps match this person to existing records." error={errors.url}>
        <input id="linkedinUrl" name="linkedinUrl" type="url" inputMode="url" defaultValue={values.url} placeholder="https://www.linkedin.com/in/..." aria-invalid={errors.url ? true : undefined} aria-describedby={errors.url ? "linkedinUrl-error" : "linkedinUrl-hint"} className="input" />
      </Field>
      <Field id="headline" label="Headline" hint="For example: Plant Manager at Acme">
        <input id="headline" name="headline" defaultValue={values.headline} autoComplete="off" aria-describedby="headline-hint" className="input" />
      </Field>
      <Field id="text" label="Message" error={errors.text}>
        <textarea id="text" name="text" rows={7} defaultValue={values.text} required aria-invalid={errors.text ? true : undefined} aria-describedby={errors.text ? "text-error" : undefined} className="input" />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <SubmitButton pendingLabel="Adding...">Add message</SubmitButton>
      </div>
    </form>
  );
}
