"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Card } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Badge } from "../components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { Search, MapPin, Clock, Briefcase } from "lucide-react"

// Mock job data
const jobs = [
  {
    id: 1,
    title: "Senior Frontend Engineer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    description: "Build beautiful, performant user interfaces using React, TypeScript, and modern web technologies.",
    skills: ["React", "TypeScript", "Next.js"],
  },
  {
    id: 2,
    title: "Backend Engineer",
    department: "Engineering",
    location: "San Francisco, CA",
    type: "Full-time",
    description: "Design and implement scalable backend services and APIs that power our platform.",
    skills: ["Node.js", "PostgreSQL", "AWS"],
  },
  {
    id: 3,
    title: "Product Designer",
    department: "Design",
    location: "Remote",
    type: "Full-time",
    description: "Create intuitive, delightful user experiences that solve real problems for our customers.",
    skills: ["Figma", "UI/UX", "Prototyping"],
  },
  {
    id: 4,
    title: "DevOps Engineer",
    department: "Engineering",
    location: "New York, NY",
    type: "Full-time",
    description: "Build and maintain our infrastructure, CI/CD pipelines, and deployment systems.",
    skills: ["Kubernetes", "Docker", "Terraform"],
  },
  {
    id: 5,
    title: "Product Manager",
    department: "Product",
    location: "Remote",
    type: "Full-time",
    description: "Define product strategy and roadmap, working closely with engineering and design teams.",
    skills: ["Strategy", "Analytics", "Communication"],
  },
  {
    id: 6,
    title: "Marketing Manager",
    department: "Marketing",
    location: "Austin, TX",
    type: "Full-time",
    description: "Drive growth through creative marketing campaigns and data-driven strategies.",
    skills: ["SEO", "Content", "Analytics"],
  },
  {
    id: 7,
    title: "Data Scientist",
    department: "Engineering",
    location: "Remote",
    type: "Contract",
    description: "Analyze complex datasets and build machine learning models to drive business insights.",
    skills: ["Python", "ML", "Statistics"],
  },
  {
    id: 8,
    title: "Customer Success Manager",
    department: "Customer Success",
    location: "Remote",
    type: "Full-time",
    description: "Help our customers succeed by providing exceptional support and guidance.",
    skills: ["Communication", "Problem-solving", "Empathy"],
  },
]

const departments = ["All Departments", "Engineering", "Design", "Product", "Marketing", "Customer Success"]
const locations = ["All Locations", "Remote", "San Francisco, CA", "New York, NY", "Austin, TX"]
const types = ["All Types", "Full-time", "Part-time", "Contract"]

export function JobListings() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments")
  const [selectedLocation, setSelectedLocation] = useState("All Locations")
  const [selectedType, setSelectedType] = useState("All Types")

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.skills.some((skill) => skill.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesDepartment = selectedDepartment === "All Departments" || job.department === selectedDepartment
    const matchesLocation = selectedLocation === "All Locations" || job.location === selectedLocation
    const matchesType = selectedType === "All Types" || job.type === selectedType

    return matchesSearch && matchesDepartment && matchesLocation && matchesType
  })

  return (
    <section className="py-24 px-4 bg-secondary/30">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-balance">Open Positions</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed">
            Find your next opportunity and join our mission to build the future.
          </p>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8"
        >
          <Card className="p-6 bg-card border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background border-border"
                />
              </div>

              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Job Type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>
        </motion.div>

        {/* Results count */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-6"
        >
          <p className="text-muted-foreground">
            Showing {filteredJobs.length} {filteredJobs.length === 1 ? "position" : "positions"}
          </p>
        </motion.div>

        {/* Job listings */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="space-y-4"
        >
          {filteredJobs.length === 0 ? (
            <Card className="p-12 bg-card border-border text-center">
              <p className="text-muted-foreground text-lg">
                No positions found matching your criteria. Try adjusting your filters.
              </p>
            </Card>
          ) : (
            filteredJobs.map((job, index) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
              >
                <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all duration-300 group">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <h3 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                          {job.title}
                        </h3>
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                          {job.department}
                        </Badge>
                      </div>

                      <p className="text-muted-foreground mb-4 leading-relaxed">{job.description}</p>

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span>{job.location}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{job.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4" />
                          <span>{job.department}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {job.skills.map((skill) => (
                          <Badge key={skill} variant="outline" className="border-border">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>

                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </motion.div>
      </div>
    </section>
  )
}
