using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Doorlist.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RetireReleaseTrackerSwitch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hand-edited: EF generated DropTable for Apps, Environments,
            // Releases and ChecklistItems, because the model no longer maps
            // them (the release tracker is retired, ADR 6). The tables stay
            // in this step: the API version still running during a deploy
            // reads and writes them. RetireReleaseTrackerContract drops them.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Hand-edited: EF generated CreateTable for the four tables, but
            // Up never dropped them, so there's nothing to put back.
        }
    }
}
