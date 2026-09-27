import { useState } from "react"
import { motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Card } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { useToast } from "../hooks/Toast"
import { Loader2, CheckCircle2 } from "lucide-react"

// --- Zod schema matching backend ---
const careersSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Name must be at least 3 characters long" })
        .max(30, { message: "Name cannot exceed 30 characters" }),
    email: z
        .string()
        .email({ message: "Please provide a valid email address" }),
    contact: z
        .string()
        .min(7, { message: "Contact must be a number with at least 7 digits" })
        .max(15, { message: "Contact must be at most 15 digits" })
        .regex(/^\d+$/, { message: "Contact must be a number" }),
    linkedin: z
        .string()
        .trim()
        .refine((value) => {
            try {
                const url = new URL(value)
                const host = url.hostname.toLowerCase()
                return (
                    url.protocol === "https:" &&
                    (host === "linkedin.com" || host.endsWith(".linkedin.com"))
                )
            } catch {
                return false
            }
        }, { message: "Use an https LinkedIn profile URL" }),
})

type CareersFormData = z.infer<typeof careersSchema>

export function CareersForm() {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const { toast } = useToast()

    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<CareersFormData>({
        resolver: zodResolver(careersSchema),
    })

    const onSubmit = async (data: CareersFormData) => {
        setIsSubmitting(true)
        try {
            const res = await fetch("/api/careers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: data.name,
                    email: data.email,
                    contact: Number(data.contact),
                    linkedin: data.linkedin,
                }),
            })
            if (!res.ok) throw new Error("Submission failed")
            setIsSuccess(true)
            toast({
                title: "Application Submitted!",
                description:
                    "We'll review your application and get back to you soon.",
            })
            reset()
        } catch (err) {
            toast({
                title: "Submission failed",
                description: "Please try again later.",
                variant: "destructive",
            })
            console.log(err)
        } finally {
            setIsSubmitting(false)
            setTimeout(() => setIsSuccess(false), 3000)
        }
    }

    return (
        <section className="py-24 px-4 bg-secondary/30">
            <div className="max-w-xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-12"
                >
                    <h2 className="text-4xl md:text-5xl font-bold mb-4 text-balance">
                        Apply Now
                    </h2>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed">
                        Take the first step towards joining our team. Fill out
                        the form below and we'll be in touch.
                    </p>
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                >
                    <Card className="p-8 bg-card border-border">
                        {isSuccess ? (
                            <div className="text-center py-12">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{
                                        type: "spring",
                                        duration: 0.5,
                                    }}
                                >
                                    <CheckCircle2 className="w-20 h-20 text-primary mx-auto mb-4" />
                                </motion.div>
                                <h3 className="text-2xl font-bold mb-2">
                                    Application Submitted!
                                </h3>
                                <p className="text-muted-foreground">
                                    Thank you for your interest. We'll review
                                    your application and get back to you soon.
                                </p>
                            </div>
                        ) : (
                            <form
                                onSubmit={handleSubmit(onSubmit)}
                                className="space-y-6"
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">
                                            Name{" "}
                                            <span className="text-destructive">
                                                *
                                            </span>
                                        </Label>
                                        <Input
                                            id="name"
                                            {...register("name")}
                                            placeholder="John Doe"
                                            className="bg-background border-border"
                                        />
                                        {errors.name && (
                                            <p className="text-sm text-destructive">
                                                {errors.name.message}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">
                                            Email{" "}
                                            <span className="text-destructive">
                                                *
                                            </span>
                                        </Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            {...register("email")}
                                            placeholder="john@example.com"
                                            className="bg-background border-border"
                                        />
                                        {errors.email && (
                                            <p className="text-sm text-destructive">
                                                {errors.email.message}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="contact">
                                            Contact Number{" "}
                                            <span className="text-destructive">
                                                *
                                            </span>
                                        </Label>
                                        <Input
                                            id="contact"
                                            type="tel"
                                            {...register("contact")}
                                            placeholder="9876543210"
                                            className="bg-background border-border"
                                        />
                                        {errors.contact && (
                                            <p className="text-sm text-destructive">
                                                {errors.contact.message}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="linkedin">
                                            LinkedIn URL{" "}
                                            <span className="text-destructive">
                                                *
                                            </span>
                                        </Label>
                                        <Input
                                            id="linkedin"
                                            {...register("linkedin")}
                                            placeholder="https://linkedin.com/in/yourprofile"
                                            className="bg-background border-border"
                                        />
                                        {errors.linkedin && (
                                            <p className="text-sm text-destructive">
                                                {errors.linkedin.message}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-lg py-6"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        "Submit Application"
                                    )}
                                </Button>
                            </form>
                        )}
                    </Card>
                </motion.div>
            </div>
        </section>
    )
}
